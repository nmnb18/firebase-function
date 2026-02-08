import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const getNotifications = functions.https.onRequest(
    { region: "asia-south1", timeoutSeconds: 10, memory: '128MiB' },
    async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

                // Authenticate user
                const currentUser = await authenticateUser(req.headers.authorization);
                const userId = currentUser.uid;

                if (!currentUser || !userId) {
                    return res.status(401).json({ error: "Unauthorized" });
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

                return res.status(200).json({ success: true, notifications, total: notifications.length });
            } catch (err: any) {
                console.error("getUserNotifications Error:", err);
                return res.status(500).json({ error: err.message || "Internal server error" });
            }
        });
    }
);
