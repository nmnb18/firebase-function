import rateLimit from "express-rate-limit";

/**
 * NOTE: express-rate-limit uses an in-memory store by default.
 * On Cloud Functions, each instance has its own counter — limits are
 * per-instance, not globally enforced across the fleet.
 * This still provides meaningful protection against single-client
 * brute-force and DoS bursts. A global Redis-backed store can be
 * added later if stricter enforcement is needed.
 */

const rateLimitMessage = (action: string) => ({
    success: false,
    error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Too many ${action} attempts. Please try again later.`,
        statusCode: 429,
    },
});

/** 10 attempts per IP per 15 minutes — brute-force login protection */
export const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage("login"),
    skip: () => process.env.NODE_ENV === "test" || !!process.env.FUNCTIONS_EMULATOR,
});

/** 20 orders per IP per minute — prevents payment order spam */
export const upiOrderRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage("payment order"),
    skip: () => process.env.NODE_ENV === "test" || !!process.env.FUNCTIONS_EMULATOR,
});

/** 60 scans per IP per minute — generous for sellers at busy counters */
export const qrScanRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage("QR scan"),
    skip: () => process.env.NODE_ENV === "test" || !!process.env.FUNCTIONS_EMULATOR,
});

/** 5 OTP send attempts per IP per 10 minutes — prevents SMS cost abuse */
export const otpRateLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage("OTP request"),
    skip: () => process.env.NODE_ENV === "test" || !!process.env.FUNCTIONS_EMULATOR,
});

/** 120 log batches per IP per minute — generous for crash / error reporting */
export const clientLogRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage("log ingestion"),
    skip: () => process.env.NODE_ENV === "test" || !!process.env.FUNCTIONS_EMULATOR,
});

/** 30 lookups per IP per minute — prevents UPI VPA enumeration */
export const vpaLookupRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage("VPA lookup"),
    skip: () => process.env.NODE_ENV === "test" || !!process.env.FUNCTIONS_EMULATOR,
});
