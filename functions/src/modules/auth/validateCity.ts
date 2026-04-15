import { Request, Response, NextFunction } from "express";
import { adminRef, db } from "../../config/firebase";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

/**
 * Extract real client IP. Cloud Functions sit behind a load balancer,
 * so x-forwarded-for is the authoritative source for the originating IP.
 */
function extractClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
        const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        return ips.split(",")[0].trim();
    }
    return "unknown";
}

/**
 * Optionally decode the Bearer token to get the user_id.
 * Never throws — returns null if the request is unauthenticated or the token is invalid.
 */
async function tryGetUserId(authHeader?: string): Promise<string | null> {
    if (!authHeader?.startsWith("Bearer ")) return null;
    try {
        const token = authHeader.split("Bearer ")[1];
        const decoded = await adminRef.auth().verifyIdToken(token);
        return decoded.uid;
    } catch {
        return null;
    }
}

/**
 * Fire-and-forget security logger.
 * Writes to two places:
 *   1. city_access_log — every validateCity call (enabled + coming_soon) for IP/pattern analysis
 *   2. city_enquiries/{cityKey}/enquiries — per-user sub-doc for COMING_SOON cities only
 */
async function logCityAccess(req: Request, cityKey: string, status: string): Promise<void> {
    const userId = await tryGetUserId(req.headers.authorization);
    const ip = extractClientIp(req);
    // Truncate user-agent to avoid runaway writes from malformed headers
    const userAgent = (req.headers["user-agent"] ?? "unknown").substring(0, 512);

    const batch = db.batch();

    // Security telemetry — all requests regardless of city status
    const logRef = db.collection("city_access_log").doc();
    batch.set(logRef, {
        city_key: cityKey,
        status,
        user_id: userId,
        ip,
        user_agent: userAgent,
        created_at: adminRef.firestore.FieldValue.serverTimestamp(),
    });

    // Per-city user enquiry list — only for cities not yet live
    if (status === "COMING_SOON") {
        const enquiryRef = db
            .collection("city_enquiries")
            .doc(cityKey)
            .collection("enquiries")
            .doc();
        batch.set(enquiryRef, {
            user_id: userId,
            created_at: adminRef.firestore.FieldValue.serverTimestamp(),
        });
    }

    await batch.commit();
}

export const validateCityHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { city } = req.body;

        if (!city) {
            return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "City is required", HttpStatus.BAD_REQUEST);
        }

        const cityKey = city.toLowerCase().trim();

        const configSnap = await db
            .collection("app_settings")
            .doc("city_config")
            .get();

        if (!configSnap.exists) {
            return sendError(res, ErrorCodes.INTERNAL_ERROR, "City config missing", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const {
            enabled_cities = [],
        } = configSnap.data()!;

        if (enabled_cities.includes(cityKey)) {
            // Log for security telemetry even on valid cities (non-blocking)
            logCityAccess(req, cityKey, "ENABLED").catch((err) =>
                console.error("[validateCity] logCityAccess failed:", err)
            );
            return sendSuccess(res, { status: "ENABLED", city: cityKey }, HttpStatus.OK);
        }

        // Increment aggregate counter for the city enquiry dashboard
        const enquiryRef = db.collection("city_enquiries").doc(cityKey);
        await enquiryRef.set(
            {
                count: adminRef.firestore.FieldValue.increment(1),
                last_enquired_at: adminRef.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        // Log user + IP details for security monitoring (non-blocking — never delays the response)
        logCityAccess(req, cityKey, "COMING_SOON").catch((err) =>
            console.error("[validateCity] logCityAccess failed:", err)
        );

        return sendSuccess(res, { status: "COMING_SOON", city: cityKey }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};