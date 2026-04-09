import { Request, Response } from "express";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });
export const markNotificationsReadHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
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
            } catch (err: any) {
                console.error("Mark read error", err);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, err.message, err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};