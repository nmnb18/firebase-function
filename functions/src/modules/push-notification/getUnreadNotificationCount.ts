import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const getUnreadNotificationCountHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
                const user = await authenticateUser(req.headers.authorization);
                if (!user?.uid) return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);

                const snap = await db
                    .collection("user_notifications")
                    .doc(user.uid)
                    .collection("notifications")
                    .where("read", "==", false)
                    .get();

                return sendSuccess(res, { count: snap.size }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};