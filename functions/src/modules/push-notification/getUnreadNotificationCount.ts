import { Request, Response } from "express";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const getUnreadNotificationCountHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
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
            } catch (err: any) {
                console.error("Unread count error", err);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, err.message, err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};