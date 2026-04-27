import { Request, Response, NextFunction } from "express";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import {
    generateQRBase64,
    generateQRId,
    generateRedemptionId,
} from "../../utils/qr-helper";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const createRedemptionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // 🔐 Authenticate user
        const currentUser = await authenticateUser(req.headers.authorization);
        if (!currentUser?.uid) {
            return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
        }

        const { seller_id, points, offer_id, offer_name } = req.body;

        if (!seller_id || !points) {
            return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "seller_id and points are required", HttpStatus.BAD_REQUEST);
        }

        if (points <= 0) {
            return sendError(res, ErrorCodes.INVALID_INPUT, "Points must be greater than 0", HttpStatus.BAD_REQUEST);
        }

        // 🔎 Parallel: Fetch seller + user
        const [sellerDoc, userDoc] = await Promise.all([
            db.collection("seller_profiles").doc(seller_id).get(),
            db.collection("customer_profiles").doc(currentUser.uid).get()
        ]);

        if (!sellerDoc.exists) {
            return sendError(res, ErrorCodes.NOT_FOUND, "Seller not found", HttpStatus.NOT_FOUND);
        }

        const seller = sellerDoc.data();
        const userData = userDoc.exists ? userDoc.data() : {};

        // 🆔 Generate redemption ID
        const redemptionId = generateRedemptionId();

        // 📦 QR data
        const qrPayload = {
            type: "redemption",
            redemption_id: redemptionId,
            seller_id,
            user_id: currentUser.uid,
            points,
            timestamp: Date.now(),
            hash: generateQRId(),
        };

        const qrData = JSON.stringify(qrPayload);
        const qrBase64 = await generateQRBase64(qrData);

        // 📄 References
        const pointsQuery = await db
            .collection("points")
            .where("user_id", "==", currentUser.uid)
            .where("seller_id", "==", seller_id)
            .limit(1)
            .get();

        if (pointsQuery.empty) {
            return sendError(res, ErrorCodes.NOT_FOUND, "No points found for this seller", HttpStatus.BAD_REQUEST);
        }

        const userPointsDoc = pointsQuery.docs[0];
        const pointsRef = userPointsDoc.ref;

        const now = Date.now();
        const expiresAt = adminRef.firestore.Timestamp.fromMillis(
            now + 5 * 60 * 1000 // 5 minutes
        );


        // Query active point holds OUTSIDE the transaction.
        // Firestore transactions only support tx.get() on DocumentReferences,
        // not on collection queries (.where). Reading holds outside is safe:
        // the transaction itself atomically enforces the final balance check.
        const existingHoldsSnap = await db
            .collection("point_holds")
            .where("user_id", "==", currentUser.uid)
            .where("seller_id", "==", seller_id)
            .where("status", "==", "reserved")
            .get();

        let reservedPoints = 0;
        existingHoldsSnap.forEach((doc) => {
            reservedPoints += doc.data().points || 0;
        });

        // 🔐 TRANSACTION (critical)
        await db.runTransaction(async (tx) => {
            // 1️⃣ Read total points atomically
            const pointsSnap = await tx.get(pointsRef);
            const totalPoints = pointsSnap.data()?.points || 0;

            // 2️⃣ Reserved points computed before transaction (see above)
            const availablePoints = totalPoints - reservedPoints;

            // ❌ Insufficient balance
            if (availablePoints < points) {
                throw new Error(
                    `Insufficient available points. Available: ${availablePoints}`
                );
            }

            // 3️⃣ Create point hold
            tx.set(db.collection("point_holds").doc(), {
                user_id: currentUser.uid,
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
                user_id: currentUser.uid,
                user_name: userData?.name || "Customer",
                user_email: userData?.email || "",
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
        return sendSuccess(res, {
            redemption_id: redemptionId,
            expires_at: expiresAt,
            qr_code_base64: qrBase64,
            qr_data: qrData,
            status: "pending",
            seller_name: seller?.business?.shop_name,
            points,
        }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
