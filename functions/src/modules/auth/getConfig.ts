import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { sendSuccess } from "../../utils/response";

/**
 * GET /getConfig (public — no auth required)
 *
 * Returns runtime configuration used by the mobile apps.
 * Currently: otp_provider ('firebase' | 'msg91').
 *
 * Firestore doc: app_config/mobile
 * Example: { otp_provider: "firebase" }
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
    return sendSuccess(res, { otp_provider });
  } catch (err) {
    next(err);
  }
};
