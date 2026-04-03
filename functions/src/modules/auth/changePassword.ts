import { Request, Response } from "express";
import { auth } from "../../config/firebase";
import cors from "cors";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const changePasswordHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") {
                    return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "POST only", HttpStatus.METHOD_NOT_ALLOWED);
                }

                const { newPassword } = req.body;
                const authHeader = req.headers.authorization;

                if (!authHeader) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Missing token", HttpStatus.UNAUTHORIZED);
                }

                if (!newPassword) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "New password required", HttpStatus.BAD_REQUEST);
                }

                const idToken = authHeader.replace("Bearer ", "").trim();
                const decoded = await auth.verifyIdToken(idToken);
                const uid = decoded.uid;

                // 🔥 Update password in Firebase Auth
                await auth.updateUser(uid, { password: newPassword });

                return sendSuccess(res, { message: "Password updated successfully" }, HttpStatus.OK);

            } catch (err: any) {
                console.error("changePassword error:", err);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, "Failed to update password", err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};
