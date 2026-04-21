import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { sendMSG91OTP } from "../../services/msg91";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

/**
 * POST /sendOTP
 *
 * Sends an OTP via MSG91 to the given Indian mobile number.
 * Only used when app_config/mobile.otp_provider = 'msg91'.
 *
 * Body: { phone: string, purpose?: "register" | "login" }
 *   phone   — 10-digit Indian number without country code
 *   purpose — when "register", rejects with 409 if phone is already registered
 */
export const sendOTPHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { phone, purpose } = req.body;

  try {
    // Guard: reject registration attempts for already-registered numbers
    if (purpose === "register") {
      const e164Phone = `+91${phone}`;
      const existing = await db
        .collection("users")
        .where("phone", "==", e164Phone)
        .limit(1)
        .get();

      if (!existing.empty) {
        return sendError(
          res,
          "PHONE_ALREADY_REGISTERED",
          "This phone number is already registered. Please login instead.",
          HttpStatus.CONFLICT
        );
      }
    }

    await sendMSG91OTP(phone);
    return sendSuccess(res, { message: "OTP sent successfully" });
  } catch (err: any) {
    // Surface unconfigured-key errors as 503 so the client shows a meaningful message
    if (err.message?.includes("is not configured")) {
      return sendError(
        res,
        "SERVICE_UNAVAILABLE",
        "OTP service is temporarily unavailable",
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
    next(err);
  }
};
