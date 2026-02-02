import * as functions from "firebase-functions";
import cors from "cors";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import {
    generateQRBase64,
    generateQRId,
    generateRedemptionId,
} from "../../utils/qr-helper";

const corsHandler = cors({ origin: true });

export const createRedemption = functions.https.onRequest(
    { region: 'asia-south1' }, (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            try {
                // 🔐 Authenticate user
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                const { seller_id, points, offer_id, offer_name } = req.body;

                if (!seller_id || !points) {
                    return res
                        .status(400)
                        .json({ error: "seller_id and points are required" });
                }

                if (points <= 0) {
                    return res
                        .status(400)
                        .json({ error: "Points must be greater than 0" });
                }

                // 🔎 Fetch seller
                const sellerDoc = await db
                    .collection("seller_profiles")
                    .doc(seller_id)
                    .get();

                if (!sellerDoc.exists) {
                    return res.status(404).json({ error: "Seller not found" });
                }

                const seller = sellerDoc.data();

                // 🔎 Fetch user
                const userDoc = await db
                    .collection("users")
                    .doc(currentUser.uid)
                    .get();

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
                    return res
                        .status(400)
                        .json({ error: "No points found for this seller" });
                }

                const userPointsDoc = pointsQuery.docs[0];
                const pointsRef = userPointsDoc.ref;

                const now = Date.now();
                const expiresAt = adminRef.firestore.Timestamp.fromMillis(
                    now + 5 * 60 * 1000 // 5 minutes
                );


                // 🔐 TRANSACTION (critical)
                await db.runTransaction(async (tx) => {
                    // 1️⃣ Read total points
                    const pointsSnap = await tx.get(pointsRef);
                    const totalPoints = pointsSnap.data()?.points || 0;

                    // 2️⃣ Calculate reserved points
                    const holdsSnap = await tx.get(
                        db
                            .collection("point_holds")
                            .where("user_id", "==", currentUser.uid)
                            .where("seller_id", "==", seller_id)
                            .where("status", "==", "reserved")
                    );

                    let reservedPoints = 0;
                    holdsSnap.forEach((doc) => {
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
                return res.status(200).json({
                    success: true,
                    redemption_id: redemptionId,
                    expiresAt: expiresAt,
                    qr_code_base64: qrBase64,
                    qr_data: qrData,
                    status: "pending",
                    seller_name: seller?.business?.shop_name,
                    points,
                });
            } catch (error: any) {
                console.error("createRedemption error:", error);
                return res.status(400).json({
                    error: error.message || "Failed to create redemption",
                });
            }
        });
    });
