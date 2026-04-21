import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { sendSuccess } from "../../utils/response";

/**
 * GET /getConfig (public — no auth required)
 *
 * Returns runtime configuration used by the mobile apps.
 *   otp_provider       — 'firebase' | 'msg91'
 *   geocoding_provider — 'google' | 'here'
 *
 * Firestore doc: app_config/mobile
 */
export const getConfigHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const snap = await db.collection("app_config").doc("mobile").get();
    const data = snap.data();
    const otp_provider: string = data?.otp_provider ?? "firebase";
    const geocoding_provider: string = data?.geocoding_provider ?? "google";
    return sendSuccess(res, { otp_provider, geocoding_provider });
  } catch (err) {
    next(err);
  }
};
