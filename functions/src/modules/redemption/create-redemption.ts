import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { generateQRBase64, generateQRId, generateRedemptionId } from "../../utils/qr-helper";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const createRedemption = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            // Authenticate user
            const currentUser = await authenticateUser(req.headers.authorization);

            const { seller_id, points, offer_id, offer_name } = req.body;

            if (!seller_id || !points) {
                return res.status(400).json({ error: "seller_id and points are required" });
            }

            // Validate points
            if (points <= 0) {
                return res.status(400).json({ error: "Points must be greater than 0" });
            }

            // 1. Check if user has enough points
            const pointsQuery = await db.collection("points")
                .where("user_id", "==", currentUser.uid)
                .where("seller_id", "==", seller_id)
                .limit(1)
                .get();

            if (pointsQuery.empty) {
                return res.status(400).json({ error: "No points found for this seller" });
            }

            const userPointsDoc = pointsQuery.docs[0];
            const currentPoints = userPointsDoc.data().points || 0;

            if (currentPoints < points) {
                return res.status(400).json({ error: "Insufficient points" });
            }

            // 2. Fetch seller details
            const sellerDoc = await db.collection("seller_profiles").doc(seller_id).get();
            if (!sellerDoc.exists) {
                return res.status(404).json({ error: "Seller not found" });
            }
            const seller = sellerDoc.data();

            // 3. Fetch user details
            const userDoc = await db.collection("users").doc(currentUser.uid).get();
            const userData = userDoc.exists ? userDoc.data() : {};

            // 4. Generate unique redemption ID
            const redemptionId = generateRedemptionId();

            // 6. Generate QR data
            const qrData = JSON.stringify({
                type: "redemption",
                redemption_id: redemptionId,
                seller_id: seller_id,
                user_id: currentUser.uid,
                points: points,
                timestamp: Date.now(),
                hash: generateQRId()
            });

            // 7. Generate QR image
            const qrBase64 = await generateQRBase64(qrData);

            // 8. Create redemption document
            const redemptionData = {
                redemption_id: redemptionId,
                seller_id: seller_id,
                user_id: currentUser.uid,
                user_name: userData?.name || "Customer",
                user_email: userData?.email || "",
                seller_name: seller?.name || "",
                seller_shop_name: seller?.business?.shop_name || "",
                points: points,
                status: "pending",
                offer_id: offer_id || null,
                offer_name: offer_name || null,
                qr_data: qrData,
                qr_image_url: null, // Can store in Firebase Storage if needed
                created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    original_offer: null,
                    customer_notes: "",
                    seller_notes: ""
                }
            };

            // 9. Reserve points by creating a temporary deduction
            await db.collection("point_holds").add({
                user_id: currentUser.uid,
                seller_id: seller_id,
                redemption_id: redemptionId,
                points: points,
                status: "reserved",
                created_at: adminRef.firestore.FieldValue.serverTimestamp(),
            });

            // 10. Save redemption record
            await db.collection("redemptions").doc(redemptionId).set(redemptionData);

            // 11. Return response
            return res.status(200).json({
                success: true,
                redemption_id: redemptionId,
                qr_code_base64: qrBase64,
                qr_data: qrData,
                status: "pending",
                seller_name: seller?.business?.shop_name,
                points: points
            });

        } catch (error: any) {
            console.error("Create redemption error:", error);
            return res.status(500).json({ error: error.message });
        }
    });
});
