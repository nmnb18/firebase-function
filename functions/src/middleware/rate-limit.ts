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
