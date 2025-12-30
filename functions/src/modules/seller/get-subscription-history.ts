import * as functions from "firebase-functions";
import cors from "cors";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const getSubscriptionHistory = functions.https.onRequest({ region: "asia-south1", }, async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Only GET allowed" });
        }

        try {
            // Authenticate user
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser || !currentUser.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const { sellerId } = req.query;

            if (!sellerId) {
                return res.status(400).json({
                    success: false,
                    message: "Seller ID is required"
                });
            }

            // Verify the sellerId matches the authenticated user
            if (sellerId !== currentUser.uid) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }

            // Get subscription history from Firestore
            const historySnapshot = await db
                .collection("subscription_history")
                .doc(sellerId as string)
                .collection("records")
                .orderBy("paid_at", "desc")
                .get();

            if (historySnapshot.empty) {
                return res.status(200).json({
                    success: true,
                    history: [],
                    message: "No subscription history found"
                });
            }

            const history = historySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return res.status(200).json({
                success: true,
                history,
                total: history.length
            });

        } catch (error: any) {
            console.error("Get subscription history error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch subscription history"
            });
        }
    });
});