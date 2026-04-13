import { Request, Response, NextFunction } from "express";
import { sendMSG91OTP } from "../../services/msg91";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

/**
 * POST /sendOTP
 *
 * Sends an OTP via MSG91 to the given Indian mobile number.
 * Only used when app_config/mobile.otp_provider = 'msg91'.
 *
 * Body: { phone: string }  — 10-digit Indian number without country code
 */
export const sendOTPHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { phone } = req.body;

  try {
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
