/**
 * Typed Application Error Classes (T2-02.4)
 *
 * All handlers should throw one of these errors instead of calling
 * sendError() in a catch block. The centralized error-handler middleware
 * (middleware/error-handler.ts) converts them to standardized responses
 * and persists 5xx errors to Firestore.
 *
 * Usage:
 *   throw new ValidationError("seller_id is required");
 *   throw new AuthenticationError();
 *   throw new NotFoundError("Seller");
 *   throw new ConflictError("Order already processed", { order_id });
 *   throw new DatabaseError("Batch write failed");
 *   throw new ExternalServiceError("Razorpay", { endpoint: "orders.create" });
 */

import { ErrorCodes, HttpStatus } from "./response";

// ── Base ───────────────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  /**
   * true  = expected operational error (user/input/conflict) — message safe to expose.
   * false = programmer or infrastructure error — generic message sent to client.
   */
  public readonly isOperational: boolean;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = ErrorCodes.INTERNAL_ERROR,
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    isOperational = true,
    metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.metadata = metadata;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── 4xx — operational ──────────────────────────────────────────────────────

/** 400 — bad / missing request body fields */
export class ValidationError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, ErrorCodes.INVALID_INPUT, HttpStatus.BAD_REQUEST, true, metadata);
  }
}

/** 401 — missing or invalid Firebase JWT */
export class AuthenticationError extends AppError {
  constructor(message = "Unauthorized", metadata?: Record<string, unknown>) {
    super(message, ErrorCodes.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, true, metadata);
  }
}

/** 403 — authenticated but not permitted */
export class AuthorizationError extends AppError {
  constructor(message = "Forbidden", metadata?: Record<string, unknown>) {
    super(message, ErrorCodes.FORBIDDEN, HttpStatus.FORBIDDEN, true, metadata);
  }
}

/** 404 — document / resource does not exist */
export class NotFoundError extends AppError {
  constructor(resource: string, metadata?: Record<string, unknown>) {
    super(`${resource} not found`, ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND, true, metadata);
  }
}

/** 409 — resource already exists or has been processed */
export class ConflictError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, ErrorCodes.ALREADY_EXISTS, HttpStatus.CONFLICT, true, metadata);
  }
}

/** 422 — business-logic rule violated (insufficient points, expired QR, etc.) */
export class BusinessRuleError extends AppError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(message, code, HttpStatus.UNPROCESSABLE_ENTITY, true, metadata);
  }
}

// ── 5xx — infrastructure / programmer ─────────────────────────────────────

/** 500 — Firestore operation failed */
export class DatabaseError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, ErrorCodes.DATABASE_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, false, metadata);
  }
}

/** 502 — Razorpay / Expo Push / external HTTP call failed */
export class ExternalServiceError extends AppError {
  constructor(service: string, metadata?: Record<string, unknown>) {
    super(
      `External service error: ${service}`,
      ErrorCodes.EXTERNAL_SERVICE_ERROR,
      502,
      true,
      metadata,
    );
  }
}
