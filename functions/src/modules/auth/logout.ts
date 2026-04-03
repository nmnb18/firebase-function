import { Request, Response } from "express";
import { auth } from "../../config/firebase";
import { authenticateExpiredToken, AuthError } from "../../middleware/auth";
import cors from "cors";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

interface LogoutUserData {
    uid: string;
}

const corsHandler = cors({ origin: true });

export const logoutHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") {
                    return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
                }

                const { uid } = req.body;
                if (!uid) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "UID is required", HttpStatus.BAD_REQUEST);
                }

                // Accept expired tokens — decode-only check that the token belongs to the claimed uid.
                authenticateExpiredToken(req.headers.authorization, uid);

                // Revoke user's refresh tokens
                await auth.revokeRefreshTokens(uid);

                return sendSuccess(res, { message: "User logged out successfully" }, HttpStatus.OK);
            } catch (error: any) {
                console.error("LogoutUser Error:", error);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, error.message || "Internal Server Error", error.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};
