import * as functions from "firebase-functions";
import cors from "cors";
import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { calculateDistance } from "../../utils/qr-helper";

const corsHandler = cors({ origin: true });

export const verifyPaymentForUser = functions.https.onRequest(
    {
        secrets: [
            "RAZORPAY_ENV",
            "RAZORPAY_SECRET_TEST"
        ]
    },
    async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Only POST allowed" });
            }

            try {
                // ---------------------------------------------------
                // AUTHENTICATE USER
                // ---------------------------------------------------
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                // ---------------------------------------------------
                // READ INPUT
                // ---------------------------------------------------
                const {
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature,
                    sellerId,
                    qr_id,
                    user_lat,
                    user_lng,
                } = req.body;

                if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                    return res.status(400).json({ error: "Missing payment verification params" });
                }

                if (!sellerId) {
                    return res.status(400).json({ error: "sellerId is required" });
                }

                // ---------------------------------------------------
                // VERIFY SIGNATURE
                // ---------------------------------------------------
                const env = process.env.RAZORPAY_ENV || "test";
                const key_secret =
                    env === "live"
                        ? process.env.RAZORPAY_SECRET_LIVE!
                        : process.env.RAZORPAY_SECRET_TEST!;

                const body = razorpay_order_id + "|" + razorpay_payment_id;
                const expectedSignature = crypto
                    .createHmac("sha256", key_secret)
                    .update(body)
                    .digest("hex");

                if (expectedSignature !== razorpay_signature) {
                    return res.status(400).json({ error: "Invalid signature" });
                }

                // ---------------------------------------------------
                // MARK USER PAYMENT AS "paid"
                // ---------------------------------------------------
                const paymentRef = db.collection("user_payments").doc(razorpay_order_id);
                const paymentSnap = await paymentRef.get();

                if (!paymentSnap.exists) {
                    return res.status(404).json({ error: "Payment not found" });
                }

                const paymentData = paymentSnap.data();

                await paymentRef.update({
                    status: "paid",
                    razorpay_payment_id,
                    razorpay_signature,
                    verified_at: adminRef.firestore.FieldValue.serverTimestamp(),
                });

                // ---------------------------------------------------
                // REWARD POINTS ALLOCATION (if qr_id exists)
                // ---------------------------------------------------
                let pointsEarned = 0;
                let sellerName = "";

                if (qr_id) {

                    // Load QR
                    const qrRef = db.collection("qr_codes");
                    const qrQuery = await qrRef.where("qr_id", "==", qr_id).limit(1).get();

                    if (!qrQuery.empty) {
                        const qrDoc = qrQuery.docs[0];
                        const qrData = qrDoc.data();

                        const qrType = qrData.qr_type;
                        const pointsValue = qrData.points_value;
                        const sellerProfile = (
                            await db.collection("seller_profiles").doc(sellerId).get()
                        ).data();

                        sellerName = sellerProfile?.business?.shop_name || "Store";

                        // Validate dynamic
                        if (qrType === "dynamic") {
                            if (qrData.used) {
                                // Do NOT fail payment, user still paid; just no reward.
                                pointsEarned = 0;
                            } else {
                                // mark used
                                await qrDoc.ref.update({
                                    used: true,
                                    used_by: currentUser.uid,
                                    used_at: new Date(),
                                });
                                pointsEarned = pointsValue;
                            }
                        }

                        // Validate static (once/day + location)
                        else if (qrType === "static") {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);

                            // Already scanned today?
                            const dailyScanRef = db.collection("daily_scans");
                            const dailyScanQuery = await dailyScanRef
                                .where("user_id", "==", currentUser.uid)
                                .where("seller_id", "==", sellerId)
                                .where("scan_date", ">=", today)
                                .limit(1)
                                .get();

                            if (dailyScanQuery.empty) {
                                // Location Validation if seller has location enabled
                                if (sellerProfile?.location?.lat && sellerProfile.location.lng) {
                                    if (!user_lat || !user_lng) {
                                        // user didn't allow location → no reward
                                        pointsEarned = 0;
                                    } else {
                                        const distance = calculateDistance(
                                            sellerProfile.location.lat,
                                            sellerProfile.location.lng,
                                            user_lat,
                                            user_lng
                                        );
                                        const maxDistance = sellerProfile.location.radius_meters || 100;

                                        if (distance <= maxDistance) {
                                            pointsEarned = pointsValue;

                                            // Save today’s scan
                                            await dailyScanRef.add({
                                                user_id: currentUser.uid,
                                                seller_id: sellerId,
                                                qr_id,
                                                scan_date: today,
                                                scanned_at: new Date(),
                                            });
                                        }
                                    }
                                } else {
                                    // No location restriction → reward directly
                                    pointsEarned = pointsValue;
                                }
                            }
                        }

                        // Hidden QR (one time)
                        else if (qrType === "static_hidden") {
                            if (!qrData.used) {
                                await qrDoc.ref.update({
                                    used: true,
                                    used_by: currentUser.uid,
                                    used_at: new Date(),
                                });
                                pointsEarned = pointsValue;
                            }
                        }

                        // -------------------------------------------------------
                        // Credit points to user
                        // -------------------------------------------------------
                        if (pointsEarned > 0) {
                            const userPointsRef = db.collection("points");
                            const pointsQuery = await userPointsRef
                                .where("user_id", "==", currentUser.uid)
                                .where("seller_id", "==", sellerId)
                                .limit(1)
                                .get();

                            let totalPoints = pointsEarned;

                            if (!pointsQuery.empty) {
                                const oldDoc = pointsQuery.docs[0];
                                const oldPoints = oldDoc.data().points || 0;
                                totalPoints = oldPoints + pointsEarned;

                                await oldDoc.ref.update({
                                    points: totalPoints,
                                    last_updated: new Date(),
                                });
                            } else {
                                await userPointsRef.add({
                                    user_id: currentUser.uid,
                                    seller_id: sellerId,
                                    points: pointsEarned,
                                    last_updated: new Date(),
                                });
                            }

                            // Add transaction
                            await db.collection("transactions").add({
                                user_id: currentUser.uid,
                                seller_id: sellerId,
                                seller_name: sellerName,
                                points: pointsEarned,
                                transaction_type: "earn",
                                timestamp: new Date(),
                                qr_type: qrType,
                                description: `Earned ${pointsEarned} points`,
                            });
                        }
                    }
                }

                // ---------------------------------------------------
                // RESPONSE
                // ---------------------------------------------------
                return res.status(200).json({
                    success: true,
                    message: "Payment verified successfully",
                    points_earned: pointsEarned,
                    seller_name: sellerName,
                    reward_applied: pointsEarned > 0,
                });

            } catch (error: any) {
                console.error("verifyOrderForUser ERROR:", error);
                return res.status(500).json({ error: error.message });
            }
        });
    }
);
