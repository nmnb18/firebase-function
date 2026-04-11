import { Request, Response, NextFunction } from "express";
import { auth } from "../../config/firebase";
import { authenticateExpiredToken, AuthError } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

interface LogoutUserData {
    uid: string;
}

export const logoutHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

                const { uid } = req.body;
                if (!uid) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "UID is required", HttpStatus.BAD_REQUEST);
                }

                // Accept expired tokens — decode-only check that the token belongs to the claimed uid.
                authenticateExpiredToken(req.headers.authorization, uid);

                // Revoke user's refresh tokens
                await auth.revokeRefreshTokens(uid);

                return sendSuccess(res, { message: "User logged out successfully" }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
