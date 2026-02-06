import * as functions from "firebase-functions";
import { db, adminRef } from "../../config/firebase";
import {
    generateQRBase64,
    generateQRId,
    generateRedemptionId,
} from "../../utils/qr-helper";
import { createCallableFunction } from "../../utils/callable";
import {
    validateAvailablePoints,
    getSellerWithPointsEfficient,
    measurePerformance,
} from "../../utils/performance";

interface CreateRedemptionRequest {
    seller_id: string;
    points: number;
    offer_id?: string;
    offer_name?: string;
}

export const createRedemption = createCallableFunction<CreateRedemptionRequest, any>(
    async (data, auth, context) => {
        const { seller_id, points, offer_id, offer_name } = data;
        const userId = auth?.uid;

        if (!userId) {
            throw new Error("Unauthorized");
        }

        if (!seller_id || !points) {
            throw new Error("seller_id and points are required");
        }

        if (points <= 0) {
            throw new Error("Points must be greater than 0");
        }

        // 🚀 Parallel operations: Fetch seller & user data & validate points
        const [sellerWithPoints, userData, pointsValidation] = await Promise.all([
            getSellerWithPointsEfficient(db, seller_id, userId),
            db.collection("users").doc(userId).get(),
            validateAvailablePoints(db, userId, seller_id, points),
        ]);

        if (!sellerWithPoints?.seller) {
            throw new Error("Seller not found");
        }

        if (!pointsValidation.available) {
            throw new Error(pointsValidation.message);
        }

        const seller = sellerWithPoints.seller;
        const userDocData = userData.exists ? userData.data() : {};

        // 🆔 Generate redemption ID
        const redemptionId = generateRedemptionId();

        // 📦 QR data
        const qrPayload = {
            type: "redemption",
            redemption_id: redemptionId,
            seller_id,
            user_id: userId,
            points,
            timestamp: Date.now(),
            hash: generateQRId(),
        };

        const qrData = JSON.stringify(qrPayload);
        const qrBase64 = await generateQRBase64(qrData);

        const now = Date.now();
        const expiresAt = adminRef.firestore.Timestamp.fromMillis(
            now + 5 * 60 * 1000 // 5 minutes
        );

        // 🔐 TRANSACTION (critical)
        await db.runTransaction(async (tx: any) => {
            // First get the points reference
            const pointsQuery = await db
                .collection("points")
                .where("user_id", "==", userId)
                .where("seller_id", "==", seller_id)
                .limit(1)
                .get();

            if (pointsQuery.empty) {
                throw new Error("No points found for this seller");
            }

            const pointsRef = pointsQuery.docs[0].ref;
            const pointsSnap = await tx.get(pointsRef);
            const totalPoints = pointsSnap.data()?.points || 0;

            // 2️⃣ Calculate reserved points
            const holdsQuery = await db
                .collection("point_holds")
                .where("user_id", "==", userId)
                .where("seller_id", "==", seller_id)
                .where("status", "==", "reserved")
                .get();

            let reservedPoints = 0;
            holdsQuery.forEach((doc: any) => {
                reservedPoints += doc.data().points || 0;
            });

            const availablePoints = totalPoints - reservedPoints;

            // ❌ Insufficient balance
            if (availablePoints < points) {
                throw new Error(
                    `Insufficient available points. Available: ${availablePoints}`
                );
            }

            // 3️⃣ Create point hold
            tx.set(db.collection("point_holds").doc(), {
                user_id: userId,
                seller_id,
                redemption_id: redemptionId,
                points,
                status: "reserved",
                created_at: adminRef.firestore.FieldValue.serverTimestamp(),
            });

            // 4️⃣ Create redemption
            tx.set(db.collection("redemptions").doc(redemptionId), {
                redemption_id: redemptionId,
                seller_id,
                user_id: userId,
                user_name: userDocData?.name || "Customer",
                user_email: userDocData?.email || "",
                seller_name: seller?.name || "",
                seller_shop_name: seller?.business?.shop_name || "",
                points,
                status: "pending",
                expires_at: expiresAt,
                offer_id: offer_id || null,
                offer_name: offer_name || null,
                qr_data: qrData,
                qr_image_url: null,
                created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    customer_notes: "",
                    seller_notes: "",
                },
            });
        });

        // ✅ Success
        return {
            redemption_id: redemptionId,
            expires_at: expiresAt,
            qr_code_base64: qrBase64,
            qr_data: qrData,
            status: "pending",
            seller_name: seller?.business?.shop_name,
            points,
        };
    },
    { region: "asia-south1", requireAuth: true }
);
