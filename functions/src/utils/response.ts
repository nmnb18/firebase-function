/**
 * Standardized Response Utility (T1-02)
 * Consistent response format across all API endpoints
 */

import { Response } from "express";

export interface StandardError {
  code: string;
  message: string;
  statusCode: number;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: StandardError;
}

/**
 * Send standardized success response
 * @param res Express response object
 * @param data Response data
 * @param statusCode HTTP status code (default: 200)
 */
export const sendSuccess = <T = any>(
  res: Response,
  data: T,
  statusCode: number = 200
): Response<SuccessResponse<T>> => {
  return res.status(statusCode).json({
    success: true,
    data,
  });
};

/**
 * Send standardized error response
 * @param res Express response object
 * @param code Error code (uppercase with underscores, e.g., "INVALID_INPUT")
 * @param message Human-readable error message
 * @param statusCode HTTP status code (default: 400)
 */
export const sendError = (
  res: Response,
  code: string,
  message: string,
  statusCode: number = 400
): Response<ErrorResponse> => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      statusCode,
    },
  });
};

/**
 * Common error codes for consistency across endpoints
 */
export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  FORBIDDEN: "FORBIDDEN",

  // Input Validation
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  INVALID_PHONE_NUMBER: "INVALID_PHONE_NUMBER",
  INVALID_EMAIL: "INVALID_EMAIL",
  INVALID_OTP: "INVALID_OTP",

  // Resource Errors
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",

  // Business Logic Errors
  INSUFFICIENT_POINTS: "INSUFFICIENT_POINTS",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INVALID_QR_CODE: "INVALID_QR_CODE",
  QR_EXPIRED: "QR_EXPIRED",
  REDEMPTION_ALREADY_PROCESSED: "REDEMPTION_ALREADY_PROCESSED",
  ORDER_ALREADY_PROCESSED: "ORDER_ALREADY_PROCESSED",
  SUBSCRIPTION_EXPIRED: "SUBSCRIPTION_EXPIRED",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED",
  COUPON_INVALID: "COUPON_INVALID",
  COUPON_EXPIRED: "COUPON_EXPIRED",

  // Payment Errors
  PAYMENT_FAILED: "PAYMENT_FAILED",
  INVALID_PAYMENT_SIGNATURE: "INVALID_PAYMENT_SIGNATURE",
  PAYMENT_VERIFICATION_FAILED: "PAYMENT_VERIFICATION_FAILED",

  // Server Errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",

  // Method & Request Errors
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
} as const;

/**
 * Common HTTP status codes
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
