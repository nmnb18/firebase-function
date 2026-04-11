import { Request, Response, NextFunction } from "express";
import { auth } from "../../config/firebase";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const changePasswordHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

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

    } catch (err) {
        next(err);
    }
};
