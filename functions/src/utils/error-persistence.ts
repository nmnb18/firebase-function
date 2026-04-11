/**
 * Error Persistence — Firestore `error_logs` collection (T2-03.2)
 *
 * Persists server-side (5xx) errors to Firestore so teams can:
 *   • Track error frequency and trend over time
 *   • Query by endpoint, error code, or resolution status
 *   • Mark errors as resolved with notes
 *
 * Identical errors (same endpoint + error code + top stack frame) are
 * GROUPED into a single document whose `occurrences` counter is
 * incremented, preventing the collection from growing unbounded.
 *
 * This function MUST NOT throw — a failure here should never break the
 * HTTP response flow. Errors are swallowed and logged internally.
 */

import { db, adminRef } from "../config/firebase";
import { logger } from "./logger";
import crypto from "crypto";

export interface ErrorLogInput {
  correlationId: string;
  endpoint: string;        // e.g. "POST /createUPIPaymentOrder"
  errorCode: string;       // e.g. "DATABASE_ERROR"
  errorMessage: string;
  statusCode: number;
  stack?: string;
  userId?: string;
  requestBody?: unknown;   // must be PII-sanitized before passing
}

// ── Fingerprinting ────────────────────────────────────────────────────────

/**
 * Derive a deterministic MD5 hash that groups identical errors together.
 * Based on: endpoint + errorCode + first non-module stack frame.
 */
function errorHash(endpoint: string, code: string, stack?: string): string {
  const topFrame = stack?.split("\n").find((l) => l.includes("at ") && !l.includes("node_modules"))?.trim() ?? "unknown";
  return crypto
    .createHash("md5")
    .update(`${endpoint}::${code}::${topFrame}`)
    .digest("hex");
}

// ── Persistence ───────────────────────────────────────────────────────────

export async function persistErrorToFirestore(data: ErrorLogInput): Promise<void> {
  try {
    const hash = errorHash(data.endpoint, data.errorCode, data.stack);
    const ref = db.collection("error_logs").doc(hash);
    const snap = await ref.get();

    if (snap.exists) {
      // Same error seen again — update counters and latest context only
      await ref.update({
        occurrences: adminRef.firestore.FieldValue.increment(1),
        last_seen: adminRef.firestore.FieldValue.serverTimestamp(),
        last_correlation_id: data.correlationId,
        stack_trace: data.stack ?? "",
        last_request_body: data.requestBody ?? {},
      });
    } else {
      // First time we see this error — create a new document
      await ref.set({
        error_id: hash,
        correlation_id: data.correlationId,
        endpoint: data.endpoint,
        error_code: data.errorCode,
        error_message: data.errorMessage,
        status_code: data.statusCode,
        stack_trace: data.stack ?? "",
        user_id: data.userId ?? null,
        request_body: data.requestBody ?? {},
        occurrences: 1,
        resolved: false,
        resolved_at: null,
        resolved_by: null,
        resolution_notes: null,
        first_seen: adminRef.firestore.FieldValue.serverTimestamp(),
        last_seen: adminRef.firestore.FieldValue.serverTimestamp(),
        last_correlation_id: data.correlationId,
        last_request_body: data.requestBody ?? {},
      });
    }
  } catch (err) {
    // Swallow — persistence failures must never affect the HTTP response
    logger.error(
      "error-persistence: failed to write to error_logs",
      err as Error,
      { correlationId: data.correlationId, endpoint: data.endpoint },
    );
  }
}
