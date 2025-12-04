import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const getSellerRedemptions = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            const sellerUser = await authenticateUser(req.headers.authorization);

            // Get query parameters
            const { status, limit = 20, offset = 0 } = req.query;

            // Build query
            let query: any = db.collection("redemptions")
                .where("seller_id", "==", sellerUser.uid)
                .orderBy("created_at", "desc");

            // Add status filter
            if (status) {
                query = query.where("status", "==", status);
            }

            // Execute query with pagination
            const snapshot = await query
                .limit(parseInt(limit as string))
                .offset(parseInt(offset as string))
                .get();

            const redemptions = snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data(),
                created_at: doc.data().created_at?.toDate?.() || doc.data().created_at,
                expires_at: doc.data().expires_at?.toDate?.() || doc.data().expires_at,
                redeemed_at: doc.data().redeemed_at?.toDate?.() || doc.data().redeemed_at
            }));

            // Get counts
            const pendingCount = await db.collection("redemptions")
                .where("seller_id", "==", sellerUser.uid)
                .where("status", "==", "pending")
                .count()
                .get();

            const totalCount = await db.collection("redemptions")
                .where("seller_id", "==", sellerUser.uid)
                .count()
                .get();

            return res.status(200).json({
                success: true,
                redemptions: redemptions,
                stats: {
                    pending: pendingCount.data().count,
                    total: totalCount.data().count
                }
            });

        } catch (error: any) {
            console.error("Get seller redemptions error:", error);
            return res.status(500).json({ error: error.message });
        }
    });
});