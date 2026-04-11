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

function buildEntry(
  entry: BaseLogEntry,
  metadata?: LogMetadata,
): Record<string, unknown> {
  return {
    ...entry,
    ...(metadata ? { metadata: sanitize(metadata) } : {}),
    timestamp: new Date().toISOString(),
  };
}

// ── Logger ─────────────────────────────────────────────────────────────────

const appLogger = {
  debug(message: string, metadata?: LogMetadata, req?: Request): void {
    firebaseLogger.debug(buildEntry({ message, correlationId: correlationId(req) }, metadata));
  },

  info(message: string, metadata?: LogMetadata, req?: Request): void {
    firebaseLogger.info(buildEntry({ message, correlationId: correlationId(req) }, metadata));
  },

  warn(message: string, metadata?: LogMetadata, req?: Request): void {
    firebaseLogger.warn(buildEntry({ message, correlationId: correlationId(req) }, metadata));
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
      ),
    );
  },

  critical(message: string, error?: Error, metadata?: LogMetadata, req?: Request): void {
    // Firebase logger has no "critical" level — map to error with severity marker
    firebaseLogger.error(
      buildEntry(
        {
          message: `[CRITICAL] ${message}`,
          correlationId: correlationId(req),
          stack: error?.stack,
        },
        metadata,
      ),
    );
  },
};

export { appLogger as logger };
