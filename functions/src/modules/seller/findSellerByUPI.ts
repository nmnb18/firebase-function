import * as functions from "firebase-functions";
import cors from "cors";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const findSellerByUPI = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }
            const { upiId } = req.body;

            if (!upiId) {
                return res.status(400).json({ error: "UPI ID is required" });
            }

            // Find seller by UPI ID
            const sellersSnapshot = await db
                .collection("seller_profiles")
                .where("rewards.upi_ids", "array-contains", upiId)
                .limit(1)
                .get();

            if (sellersSnapshot.empty) {
                return res.status(404).json({
                    success: false,
                    error: "Seller not found for this UPI ID"
                });
            }

            const sellerDoc = sellersSnapshot.docs[0];
            const seller = sellerDoc.data();

            // Return seller info (excluding sensitive data)
            const sellerInfo = {
                id: sellerDoc.id,
                shop_name: seller.shop_name,
                business_type: seller.business_type,
                category: seller.category,
                upi_ids: seller.upi_ids,
                rewards: seller.rewards || {},
                location: seller.location || {}
            };

            return res.status(200).json({
                success: true,
                seller: sellerInfo
            });

        } catch (error: any) {
            console.error("Find seller by UPI error:", error);
            return res.status(500).json({ error: error.message });
        }
    });
});