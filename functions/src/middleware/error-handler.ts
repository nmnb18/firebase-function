/**
 * Centralized Error Handler Middleware (T2-02.5 / T2-02)
 *
 * MUST be registered as the LAST middleware in app.ts (after all routes).
 *
 * Handles every error that reaches Express via `next(error)`:
 *   1. Classifies operational vs. server errors
 *   2. Logs structured entry to Cloud Logging
 *   3. For 5xx: persists to Firestore `error_logs` collection (async)
 *   4. Returns standardized `{ success: false, error: { code, message, statusCode } }`
 *
 * Safe message policy:
 *   • Operational errors (AppError.isOperational = true)  → expose real message
 *   • Infrastructure errors (isOperational = false)        → generic "Internal server error"
 */

import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { sendError, ErrorCodes, HttpStatus } from "../utils/response";
import { getSanitizedBody } from "./sanitize-pii";
import { persistErrorToFirestore } from "../utils/error-persistence";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize any thrown value into a proper Error instance.
 * Handles plain objects thrown by Razorpay SDK, Axios, Firebase Admin, etc.
 */
function toError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown;

  if (thrown !== null && typeof thrown === "object") {
    const obj = thrown as Record<string, unknown>;
    // Walk common message fields: Razorpay → error.description, Axios → message, etc.
    const msg =
      (typeof obj["message"]      === "string" ? obj["message"]      : undefined) ??
      (typeof obj["description"]  === "string" ? obj["description"]  : undefined) ??
      (obj["error"] !== null && typeof obj["error"] === "object"
        ? (typeof (obj["error"] as Record<string, unknown>)["description"] === "string"
            ? (obj["error"] as Record<string, unknown>)["description"] as string
            : undefined)
        : undefined) ??
      JSON.stringify(obj);

    // Re-hydrate as AppError if the object has AppError's shape —
    // this preserves statusCode/code/isOperational even when instanceof fails.
    const appLike = asAppError(obj);
    if (appLike) {
      const rebuilt = new AppError(
        msg as string,
        appLike.code,
        appLike.statusCode,
        appLike.isOperational,
      );
      if (typeof obj["stack"] === "string") rebuilt.stack = obj["stack"] as string;
      return rebuilt;
    }

    const synthetic = new Error(msg as string);
    // Preserve an existing stack if the object carries one
    if (typeof obj["stack"] === "string") synthetic.stack = obj["stack"] as string;
    return synthetic;
  }

  return new Error(String(thrown));
}

/**
 * Duck-type check for AppError-shaped objects.
 * `instanceof AppError` can fail in V8/Cloud Functions when the prototype
 * chain is broken across module-load boundaries (cold starts, symlinks).
 * Checking the structural properties is always reliable.
 */
function asAppError(e: unknown): AppError | null {
  if (e instanceof AppError) return e;
  if (
    e !== null &&
    typeof e === "object" &&
    typeof (e as any).code === "string" &&
    typeof (e as any).statusCode === "number" &&
    typeof (e as any).isOperational === "boolean"
  ) {
    return e as AppError;
  }
  return null;
}

/**
 * Best-effort UID extraction for logging purposes ONLY.
 * Decodes the JWT payload without signature verification — safe because
 * this value is only written to error_logs, never used for auth decisions.
 * Falls back to req.user if a middleware has already attached the user.
 */
function tryExtractUserId(req: Request): string | undefined {
  if ((req as any).user?.uid) return (req as any).user.uid as string;

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return undefined;
  try {
    const parts = auth.slice(7).split(".");
    if (parts.length < 2) return undefined;
    // Use base64 with padding fallback for Firebase JWTs
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return (payload.user_id ?? payload.uid ?? payload.sub) as string | undefined;
  } catch {
    return undefined;
  }
}

export function errorHandlerMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const err    = toError(error);
  // Use duck-typing as primary check — instanceof can fail across
  // module-load boundaries in V8/Cloud Functions cold starts.
  const appErr = asAppError(err) ?? asAppError(error);

  const statusCode = appErr?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR;
  const errorCode  = appErr?.code       ?? ErrorCodes.INTERNAL_ERROR;
  const isOp       = appErr?.isOperational ?? false;

  const context = {
    correlationId: req.correlationId,
    endpoint: `${req.method} ${req.path}`,
    statusCode,
    errorCode,
    userId: tryExtractUserId(req),
    requestBody: getSanitizedBody(req),
  };

  if (statusCode >= 500) {
    logger.critical(`Server error on ${context.endpoint}: ${err.message}`, err, context, req);

    // Persist asynchronously — do not await, do not block the response
    persistErrorToFirestore({
      correlationId: req.correlationId,
      endpoint: context.endpoint,
      errorCode,
      errorMessage: err.message,
      statusCode,
      stack: err.stack,
      userId: context.userId,
      requestBody: context.requestBody,
    });
  } else if (statusCode >= 400) {
    logger.warn(`Client error on ${context.endpoint}: ${err.message}`, context, req);
  } else {
    logger.error(`Unexpected error on ${context.endpoint}: ${err.message}`, err, context, req);
  }

  // Never expose internal error details to the client
  const clientMessage = isOp ? err.message : "An internal server error occurred";

  sendError(res, errorCode, clientMessage, statusCode);
}
