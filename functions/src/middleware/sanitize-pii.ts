/**
 * PII Sanitization Middleware (T2-02.3 / T1-07)
 *
 * Attaches a sanitized copy of `req.body` to `req.sanitizedBody` so
 * that logging functions and the error-handler middleware can safely
 * include request payload context without leaking PII.
 *
 * The ORIGINAL `req.body` is left untouched — business logic always
 * reads from `req.body`.
 *
 * Fields redacted: UPI VPAs, phone numbers, email addresses,
 *   passwords, tokens/JWTs, OTPs, payment card details.
 */

import { Request, Response, NextFunction } from "express";

// Mirror the PII fields from logger.ts for consistency
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

function stripXSS(str: string): string {
  return str
    .replace(/<[^>]*>/g, "")                           // strip HTML tags
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")       // strip on* event handlers
    .replace(/javascript\s*:/gi, "");                  // strip javascript: URIs
}

function sanitize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") return stripXSS(value);
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitize);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = PII_FIELDS.has(k.toLowerCase()) ? "[REDACTED]" : sanitize(v);
  }
  return out;
}

export function sanitizePIIMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.sanitizedBody = sanitize(req.body);
  next();
}

/** Use this in error context objects — never log raw req.body directly. */
export function getSanitizedBody(req: Request): unknown {
  return req.sanitizedBody ?? sanitize(req.body);
}
