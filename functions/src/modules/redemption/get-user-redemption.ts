import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const getUserRedemptions = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            const currentUser = await authenticateUser(req.headers.authorization);

            // Get query parameters
            const { status, seller_id, limit = 20 } = req.query;

            // Build query
            let query: any = db.collection("redemptions")
                .where("user_id", "==", currentUser.uid)
                .orderBy("created_at", "desc");

            // Add filters
            if (status) {
                query = query.where("status", "==", status);
            }
            if (seller_id) {
                query = query.where("seller_id", "==", seller_id);
            }

            // Execute query
            const snapshot = await query.limit(parseInt(limit as string)).get();

            const redemptions = snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data(),
                created_at: doc.data().created_at?.toDate?.() || doc.data().created_at,
                expires_at: doc.data().expires_at?.toDate?.() || doc.data().expires_at,
                redeemed_at: doc.data().redeemed_at?.toDate?.() || doc.data().redeemed_at
            }));

            return res.status(200).json({
                success: true,
                redemptions: redemptions,
                count: redemptions.length
            });

        } catch (error: any) {
            console.error("Get user redemptions error:", error);
            return res.status(500).json({ error: error.message });
        }
    });
});