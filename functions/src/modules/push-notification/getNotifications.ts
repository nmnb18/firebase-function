import { Request, Response } from "express";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const getNotificationsHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "GET") return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);

                // Authenticate user
                const currentUser = await authenticateUser(req.headers.authorization);
                const userId = currentUser.uid;

                if (!currentUser || !userId) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }

                // Optional query params
                const limit = Number(req.query.limit) || 50;
                const unreadOnly = req.query.unread === "true";

                let query = db
                    .collection("user_notifications")
                    .doc(userId)
                    .collection("notifications")
                    .orderBy("created_at", "desc")
                    .limit(limit);

                if (unreadOnly) query = query.where("read", "==", false);

                const snap = await query.get();

                const notifications = snap.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                    created_at: doc.data()?.created_at?.toDate?.() || null,
                }));

                return sendSuccess(res, { notifications, total: notifications.length }, HttpStatus.OK);
            } catch (err: any) {
                console.error("getUserNotifications Error:", err);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, err.message || "Internal server error", err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};