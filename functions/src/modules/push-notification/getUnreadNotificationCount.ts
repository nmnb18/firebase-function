import { Request, Response } from "express";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const getUnreadNotificationCountHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            try {
                const user = await authenticateUser(req.headers.authorization);
                if (!user?.uid) return res.status(401).json({ error: "Unauthorized" });

                const snap = await db
                    .collection("user_notifications")
                    .doc(user.uid)
                    .collection("notifications")
                    .where("read", "==", false)
                    .get();

                return res.json({
                    success: true,
                    count: snap.size,
                });
            } catch (err: any) {
                console.error("Unread count error", err);
                return res.status(err.statusCode ?? 500).json({ error: err.message });
            }
        });
};