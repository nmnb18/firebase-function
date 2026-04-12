import { Request, Response, NextFunction } from "express";
import { auth } from "../../config/firebase";
import { verifyMSG91OTP } from "../../services/msg91";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

/**
 * POST /verifyOTP
 *
 * Verifies the OTP submitted by the user via MSG91, then:
 *  1. Looks up (or creates) the Firebase Auth user for this phone number
 *  2. Returns a Firebase Custom Token for the client to sign in with
 *
 * The client then calls auth().signInWithCustomToken(custom_token) to get
 * a real Firebase idToken, and passes that to POST /phoneLogin as normal.
 *
 * Body: { phone: string, otp: string }
 */
export const verifyOTPHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { phone, otp } = req.body;

  try {
    // 1. Verify with MSG91 — throws if invalid/expired
    await verifyMSG91OTP(phone, otp);

    // 2. Look up or create the Firebase Auth user for this phone number
    const phoneWithCode = `+91${phone}`;
    let uid: string;

    try {
      const existingUser = await auth.getUserByPhoneNumber(phoneWithCode);
      uid = existingUser.uid;
    } catch (lookupErr: any) {
      if (lookupErr.code === "auth/user-not-found") {
        const newUser = await auth.createUser({ phoneNumber: phoneWithCode });
        uid = newUser.uid;
      } else {
        throw lookupErr;
      }
    }

    // 3. Generate a short-lived custom token for the client
    const custom_token = await auth.createCustomToken(uid);

    return sendSuccess(res, { custom_token });
  } catch (err: any) {
    if (err.message === "Invalid OTP") {
      return sendError(
        res,
        ErrorCodes.INVALID_OTP,
        "Invalid or expired OTP. Please try again.",
        HttpStatus.BAD_REQUEST
      );
    }
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
