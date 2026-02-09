// firebase-functions/src/redemption/getRedemptionQR.ts
import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { generateQRBase64 } from "../../utils/qr-helper";

const corsHandler = cors({ origin: true });

export const getRedemptionQR = functions.https.onRequest({ region: "asia-south1", timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            const currentUser = await authenticateUser(req.headers.authorization);

            const { redemption_id } = req.query;

            if (!redemption_id) {
                return res.status(400).json({ error: "redemption_id is required" });
            }

            // Find redemption by redemption_id (not document ID)
            const redemptionsQuery = await db.collection("redemptions")
                .where("redemption_id", "==", redemption_id)
                .limit(1)
                .get();

            if (redemptionsQuery.empty) {
                return res.status(404).json({ error: "Redemption not found" });
            }

            const redemptionDoc = redemptionsQuery.docs[0];
            const redemptionData = redemptionDoc.data();

            // Verify the redemption belongs to the current user
            if (redemptionData.user_id !== currentUser.uid) {
                return res.status(403).json({ error: "Not authorized to view this redemption" });
            }
            const qrBase64 = await generateQRBase64(redemptionData.qr_data);
            // Return only QR-related data
            return res.status(200).json({
                success: true,
                redemption_id: redemptionData.redemption_id,
                qr_code_base64: qrBase64,
                qr_data: redemptionData.qr_data,
                status: redemptionData.status,
                expires_at: redemptionData.expires_at?.toDate?.() || redemptionData.expires_at,
                seller_shop_name: redemptionData.seller_shop_name,
                points: redemptionData.points
            });

        } catch (error: any) {
            console.error("Get redemption QR error:", error);
            return res.status(err.statusCode ?? 500).json({ error: error.message });
        }
    });
});