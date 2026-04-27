/**
 * Structured Logger (T2-02.1 / T2-03)
 *
 * Wraps firebase-functions logger to emit structured JSON log entries
 * that Cloud Logging parses into severity levels, enabling log-based
 * alerting and Firestore error persistence.
 *
 * PII is automatically redacted from metadata before every log write.
 * DO NOT add raw UPI VPAs, phone numbers, or tokens to log metadata.
 */

import { logger as firebaseLogger } from "firebase-functions";
import { Request } from "express";

// ── Severity constants recognised by Cloud Logging ─────────────────────────
// firebaseLogger.write() accepts a free-form entry object; including a top-level
// `severity` field causes Cloud Logging to override the default severity so that
// CRITICAL alerts can be distinguished from plain ERRORs in GCP dashboards.
type GcpSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

// ── PII field names to redact automatically ────────────────────────────────
const PII_FIELDS = new Set([
  "upi_vpa", "vpa", "payer_vpa", "payee_vpa",
  "phone", "phone_number", "mobile", "contact",
  "email", "email_address",
  "password", "current_password", "new_password",
  "token", "id_token", "refresh_token", "access_token",
  "authorization",
  "otp", "verification_code", "pin",
  "aadhaar", "pan", "card_number", "cvv",
  "account_number", "ifsc",
]);

// ── Types ──────────────────────────────────────────────────────────────────

export type LogMetadata = Record<string, unknown>;

interface BaseLogEntry {
  message: string;
  correlationId?: string;
  userId?: string;
  endpoint?: string;
  statusCode?: number;
  stack?: string;
}

// ── Sanitize ───────────────────────────────────────────────────────────────

function sanitize(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    out[key] = PII_FIELDS.has(key.toLowerCase()) ? "[REDACTED]" : sanitize(val);
  }
  return out;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function correlationId(req?: Request): string | undefined {
  return req ? (req as any).correlationId : undefined;
}

function userId(req?: Request): string | undefined {
  return req ? ((req as any).user?.uid as string | undefined) : undefined;
}

function buildEntry(
  entry: BaseLogEntry,
  metadata?: LogMetadata,
  req?: Request,
): Record<string, unknown> {
  return {
    ...entry,
    userId: entry.userId ?? userId(req),
    ...(metadata ? { metadata: sanitize(metadata) } : {}),
    timestamp: new Date().toISOString(),
  };
}

// ── Logger ─────────────────────────────────────────────────────────────────

const appLogger = {
  debug(message: string, metadata?: LogMetadata, req?: Request): void {
    firebaseLogger.debug(buildEntry({ message, correlationId: correlationId(req) }, metadata, req));
  },

  info(message: string, metadata?: LogMetadata, req?: Request): void {
    firebaseLogger.info(buildEntry({ message, correlationId: correlationId(req) }, metadata, req));
  },

  warn(message: string, metadata?: LogMetadata, req?: Request): void {
    firebaseLogger.warn(buildEntry({ message, correlationId: correlationId(req) }, metadata, req));
  },

  error(message: string, error?: Error, metadata?: LogMetadata, req?: Request): void {
    firebaseLogger.error(
      buildEntry(
        {
          message,
          correlationId: correlationId(req),
          stack: error?.stack,
        },
        metadata,
        req,
      ),
    );
  },

  critical(message: string, error?: Error, metadata?: LogMetadata, req?: Request): void {
    // Use firebaseLogger.write() to emit a real GCP CRITICAL severity entry
    // instead of ERROR. Cloud Logging reads the top-level `severity` field from
    // the structured JSON payload and uses it for alerting & filtering.
    (firebaseLogger as any).write({
      severity: "CRITICAL" as GcpSeverity,
      ...buildEntry(
        {
          message: `[CRITICAL] ${message}`,
          correlationId: correlationId(req),
          stack: error?.stack,
        },
        metadata,
        req,
      ),
    });
  },
};

export { appLogger as logger };
