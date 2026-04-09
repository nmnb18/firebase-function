import { Request, Response } from "express";
import cors from "cors";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const confirmPasswordResetHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") {
                    return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Only POST allowed", HttpStatus.METHOD_NOT_ALLOWED);
                }

                const { oobCode, newPassword } = req.body;

                if (!oobCode || !newPassword) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "oobCode and newPassword are required", HttpStatus.BAD_REQUEST);
                }

                const FIREBASE_API_KEY = process.env.API_KEY;

                if (!FIREBASE_API_KEY) {
                    return sendError(res, ErrorCodes.INTERNAL_ERROR, "Missing API Key in env", HttpStatus.INTERNAL_SERVER_ERROR);
                }

                // 🔥 Call Firebase REST API to verify + update password
                const response = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${FIREBASE_API_KEY}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            oobCode,
                            newPassword
                        }),
                    }
                );

                const data = await response.json() as any;

                if (data.error) {
                    const message = data.error.message;

                    if (message === "INVALID_OOB_CODE") {
                        return sendError(res, ErrorCodes.INVALID_OTP, "Invalid or expired reset link", HttpStatus.BAD_REQUEST);
                    }

                    if (message === "EXPIRED_OOB_CODE") {
                        return sendError(res, ErrorCodes.TOKEN_EXPIRED, "Reset link has expired", HttpStatus.BAD_REQUEST);
                    }

                    return sendError(res, ErrorCodes.INTERNAL_ERROR, message, HttpStatus.INTERNAL_SERVER_ERROR);
                }

                return sendSuccess(res, { message: "Password reset successful", email: data.email }, HttpStatus.OK);

            } catch (err: any) {
                console.error("confirmPasswordReset Error:", err);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, "Failed to reset password", err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};
