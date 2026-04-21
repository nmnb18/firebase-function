import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { sendSuccess, sendError, HttpStatus } from "../../utils/response";

/**
 * GET /checkPhone?phone=XXXXXXXXXX (public — no auth required)
 *
 * Checks whether a phone number is already registered.
 * Called by the Firebase OTP flow before triggering signInWithPhoneNumber,
 * since Firebase Auth bypasses the backend sendOTP endpoint.
 *
 * Returns 409 PHONE_ALREADY_REGISTERED if found, 200 otherwise.
 */
export const checkPhoneHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const phone = req.query.phone as string;

  if (!phone || !/^\d{10}$/.test(phone)) {
    return sendError(res, "INVALID_INPUT", "phone must be a 10-digit number", HttpStatus.BAD_REQUEST);
  }

  try {
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

    return sendSuccess(res, { exists: false });
  } catch (err) {
    next(err);
  }
};
