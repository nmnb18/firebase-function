import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });
export const markNotificationsRead = functions.https.onRequest(
    { region: "asia-south1" },
    async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                const user = await authenticateUser(req.headers.authorization);
                if (!user?.uid) return res.status(401).json({ error: "Unauthorized" });

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

                return res.json({ success: true });
            } catch (err: any) {
                console.error("Mark read error", err);
                return res.status(500).json({ error: err.message });
            }
        });
    }
);
