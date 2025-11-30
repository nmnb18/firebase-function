import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { calculateDistance } from "../../utils/qr-helper";
import { QRCodeScanRequest, ScanResponse } from "./types";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

/** ----------------------------------------------------
 * UNIVERSAL REWARD CALCULATOR
 * Supports: flat | percentage | slab | default
 * ---------------------------------------------------- */
function calculateRewardPoints(amount: number, seller: any): number {
    const config = seller.rewards || {};

    switch (config.reward_type) {

        // 1️⃣ Percentage-based reward
        case "percentage":
            if (!config.percentage_value) return 0;
            return Math.round((config.percentage_value / 100) * amount);

        // 2️⃣ Flat fixed points
        case "flat":
            return config.flat_points || 0;

        // 3️⃣ Slab-based rewards
        case "slab":
            if (!Array.isArray(config.slab_rules)) return 0;

            for (const rule of config.slab_rules) {
                if (amount >= rule.min && amount <= rule.max) {
                    return rule.points;
                }
            }

            // amount > last slab
            const last = config.slab_rules[config.slab_rules.length - 1];
            if (amount > last.max) return last.points;

            return 0;

        // 4️⃣ Default points (QR points)
        case "default":
        default:
            return config.default_points_value || 1;
    }
}

/** ----------------------------------------------------
 * MAIN SCAN LOGIC
 * ---------------------------------------------------- */
export const scanQRCode = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {

        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            const currentUser = await authenticateUser(req.headers.authorization);

            const {
                qr_id,
                hidden_code,
                user_lat,
                user_lng,
                payment_amount,     // NEW 🔥
                payment_based       // NEW 🔥 boolean
            } = req.body as QRCodeScanRequest;

            console.log('Req Body:', req.body)

            if (!qr_id) {
                return res.status(400).json({ error: "QR ID is required" });
            }

            // -----------------------------------
            // Fetch QR Data
            // -----------------------------------
            const qrQuery = await db
                .collection("qr_codes")
                .where("qr_id", "==", qr_id)
                .limit(1)
                .get();

            if (qrQuery.empty) {
                return res.status(404).json({ error: "Invalid QR code" });
            }

            const qrDoc = qrQuery.docs[0];
            const qrData = qrDoc.data();

            console.log('QR Data:', qrData)
            const qrType = qrData.qr_type || "dynamic";
            const sellerId = qrData.seller_id;
            const rewardType = qrData.reward_type;

            // -----------------------------------
            // Fetch Seller Profile
            // -----------------------------------
            const sellerDoc = await db.collection("seller_profiles").doc(sellerId).get();
            if (!sellerDoc.exists) {
                return res.status(404).json({ error: "Seller not found" });
            }
            const seller = sellerDoc.data();

            // =====================================================
            // 1️⃣ PAYMENT-BASED REWARD FLOW (Razorpay Success)
            // =====================================================
            if (payment_based) {

                if (!payment_amount) {
                    return res.status(400).json({ error: "payment_amount is required" });
                }

                // Compute points using seller reward logic
                const rewardPoints = calculateRewardPoints(payment_amount, seller);

                // Allocate reward points
                const pointsRef = db.collection("points");
                const pointsQuery = await pointsRef
                    .where("user_id", "==", currentUser.uid)
                    .where("seller_id", "==", sellerId)
                    .limit(1)
                    .get();

                let newPoints = rewardPoints;

                if (!pointsQuery.empty) {
                    const docRef = pointsQuery.docs[0].ref;
                    const current = pointsQuery.docs[0].data().points || 0;

                    newPoints = current + rewardPoints;
                    await docRef.update({
                        points: newPoints,
                        last_updated: new Date()
                    });
                } else {
                    await pointsRef.add({
                        user_id: currentUser.uid,
                        seller_id: sellerId,
                        points: rewardPoints,
                        last_updated: new Date()
                    });
                }

                // Add transaction history
                await db.collection("transactions").add({
                    user_id: currentUser.uid,
                    seller_id: sellerId,
                    seller_name: seller?.business?.shop_name,
                    points: rewardPoints,
                    amount: payment_amount,
                    transaction_type: "earn",
                    qr_type: "payment",
                    timestamp: new Date(),
                    description: `Payment of ₹${payment_amount} - earned ${rewardPoints} points`
                });

                return res.status(200).json({
                    success: true,
                    data: {
                        message: "Payment reward credited",
                        qr_type: "payment",
                        points_earned: rewardPoints,
                        total_points: newPoints,
                        seller_name: seller?.business?.shop_name,
                    }
                });
            }

            // =====================================================
            // 2️⃣ ORIGINAL QR FLOW (dynamic / static / static_hidden)
            // =====================================================

            const pointsValue = qrData.points_value;

            // ------------------------------
            // Dynamic QR (one-time use)
            // ------------------------------
            if (qrType === "dynamic") {
                if (qrData.used) {
                    return res.status(400).json({ error: "QR code already used" });
                }

                if (qrData.expires_at && qrData.expires_at.toDate() < new Date()) {
                    return res.status(400).json({ error: "QR code expired" });
                }

                await qrDoc.ref.update({
                    used: true,
                    used_by: currentUser.uid,
                    used_at: new Date()
                });
            }

            // ------------------------------
            // Static QR (once per day)
            // ------------------------------
            if (qrType === "static") {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                // const dailyScanQuery = await db.collection("daily_scans")
                //     .where("user_id", "==", currentUser.uid)
                //     .where("seller_id", "==", sellerId)
                //     .where("scan_date", ">=", today)
                //     .limit(1)
                //     .get();

                // if (!dailyScanQuery.empty) {
                //     return res.status(400).json({ error: "Already scanned today" });
                // }

                // Location check
                if (seller?.location_lat && seller.location_lng) {

                    if (!user_lat || !user_lng) {
                        return res.status(400).json({ error: "Location is required" });
                    }

                    const distance = calculateDistance(
                        seller.location_lat,
                        seller.location_lng,
                        user_lat,
                        user_lng
                    );

                    const maxDistance = seller.location_radius_meters || 100;

                    if (distance > maxDistance) {
                        return res.status(400).json({
                            error: `Too far from store. Must be within ${maxDistance}m`
                        });
                    }
                }

                await db.collection("daily_scans").add({
                    user_id: currentUser.uid,
                    seller_id: sellerId,
                    qr_id,
                    scan_date: today,
                    scanned_at: new Date()
                });
            }

            // ------------------------------
            // Static Hidden QR
            // ------------------------------
            if (qrType === "static_hidden") {
                if (!hidden_code) {
                    return res.status(400).json({ error: "Hidden code required" });
                }

                if (qrData.used) {
                    return res.status(400).json({ error: "This code has already been used" });
                }

                if (hidden_code !== qrData.hidden_code) {
                    return res.status(400).json({ error: "Invalid hidden code" });
                }

                await qrDoc.ref.update({
                    used: true,
                    used_by: currentUser.uid,
                    used_at: new Date()
                });
            }

            // =====================================================
            // Allocate points for QR (non-payment scans)
            // =====================================================
            const pointsRef = db.collection("points");
            const pointsQuery = await pointsRef
                .where("user_id", "==", currentUser.uid)
                .where("seller_id", "==", sellerId)
                .limit(1)
                .get();

            let newPoints = pointsValue;

            if (!pointsQuery.empty) {
                const ref = pointsQuery.docs[0].ref;
                const current = pointsQuery.docs[0].data().points || 0;

                newPoints = current + pointsValue;

                await ref.update({
                    points: newPoints,
                    last_updated: new Date()
                });
            } else {
                await pointsRef.add({
                    user_id: currentUser.uid,
                    seller_id: sellerId,
                    points: pointsValue,
                    last_updated: new Date()
                });
            }

            // Add transaction
            await db.collection("transactions").add({
                user_id: currentUser.uid,
                seller_id: sellerId,
                seller_name: seller?.business?.shop_name,
                points: pointsValue,
                transaction_type: "earn",
                qr_type: qrType,
                timestamp: new Date(),
                description: `Scanned ${qrType} QR - earned ${pointsValue} pts`
            });

            return res.status(200).json({
                success: true,
                data: {
                    message: "Points earned successfully",
                    qr_type: qrType,
                    points_earned: pointsValue,
                    total_points: newPoints,
                    seller_name: seller?.business?.shop_name,
                }
            });

        } catch (error: any) {
            console.error("Scan QR Error:", error);
            return res.status(500).json({ error: error.message });
        }
    });
});
