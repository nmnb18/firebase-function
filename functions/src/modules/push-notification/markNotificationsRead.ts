import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const markNotificationsReadHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
                const user = await authenticateUser(req.headers.authorization);
                if (!user?.uid) return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);

                const { notificationIds } = req.body;

                const batch = db.batch();
                const baseRef = db
                    .collection("user_notifications")
                    .doc(user.uid)
                    .collection("notifications");

                notificationIds.forEach((id: string) => {
                    batch.update(baseRef.doc(id), { read: true });
                });

                await batch.commit();

                return sendSuccess(res, { message: "Notifications marked as read" }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};