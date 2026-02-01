import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const getUnreadNotificationCount = functions.https.onRequest(
    { region: "asia-south1" },
    async (req, res) => {
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
                return res.status(500).json({ error: err.message });
            }
        });
    }
);
