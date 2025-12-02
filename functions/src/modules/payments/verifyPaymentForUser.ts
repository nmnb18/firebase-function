import * as functions from "firebase-functions";
import cors from "cors";
import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { calculateDistance } from "../../utils/qr-helper";

const corsHandler = cors({ origin: true });

/** ----------------------------------------------------
 * UPDATE SELLER STATS
 * ---------------------------------------------------- */
async function updateSellerStats(sellerId: string, pointsEarned: number, isNewCustomer: boolean = false) {
    const sellerRef = db.collection("seller_profiles").doc(sellerId);

    // Get current date for monthly stats
    const now = new Date();
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const currentMonthKey = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();
    const monthlyScanKey = `stats.monthly_scans.${currentYear}.${currentMonthKey}`;

    // Get current document to update monthly scans properly
    const sellerDoc = await sellerRef.get();
    const sellerData = sellerDoc.data();

    const updateData: any = {
        "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
        "stats.total_points_distributed": adminRef.firestore.FieldValue.increment(pointsEarned)
    };

    // Update monthly scans - increment existing or set to 1 if doesn't exist
    const currentMonthlyScans = sellerData?.stats?.monthly_scans || {};
    const currentYearScans = currentMonthlyScans[currentYear] || {};
    const currentMonthCount = currentYearScans[currentMonthKey] || 0;

    updateData[monthlyScanKey] = currentMonthCount + 1;

    // Only increment active_customers if this is a new customer
    if (isNewCustomer) {
        updateData["stats.active_customers"] = adminRef.firestore.FieldValue.increment(1);
    }

    await sellerRef.update(updateData);
}

/** ----------------------------------------------------
 * CHECK IF USER IS NEW CUSTOMER FOR THIS SELLER
 * ---------------------------------------------------- */
async function isNewCustomer(userId: string, sellerId: string): Promise<boolean> {
    const pointsQuery = await db.collection("points")
        .where("user_id", "==", userId)
        .where("seller_id", "==", sellerId)
        .limit(1)
        .get();

    return pointsQuery.empty;
}

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
                    amount, // Payment amount
                    user_lat,
                    user_lng
                } = req.body;

                if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                    return res.status(400).json({ error: "Missing payment verification params" });
                }

                if (!sellerId) {
                    return res.status(400).json({ error: "sellerId is required" });
                }

                if (!amount) {
                    return res.status(400).json({ error: "Payment amount is required" });
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

                const sellerDoc = await db.collection("seller_profiles").doc(sellerId).get();
                if (!sellerDoc.exists) {
                    return res.status(404).json({ error: "Seller not found" });
                }
                const seller = sellerDoc.data();

                // ---------------------------------------------------
                // MARK USER PAYMENT AS "paid"
                // ---------------------------------------------------
                // Location check
                if (seller?.location.lat && seller.location.lng) {
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
                const paymentRef = db.collection("user_payments").doc(razorpay_order_id);
                const paymentSnap = await paymentRef.get();

                if (!paymentSnap.exists) {
                    return res.status(404).json({ error: "Payment not found" });
                }

                await paymentRef.update({
                    status: "paid",
                    razorpay_payment_id,
                    razorpay_signature,
                    verified_at: adminRef.firestore.FieldValue.serverTimestamp(),
                });

                // ---------------------------------------------------
                // FETCH SELLER PROFILE
                // ---------------------------------------------------

                const sellerName = seller?.business?.shop_name || "Store";

                // Check if this is a new customer
                const newCustomer = await isNewCustomer(currentUser.uid, sellerId);

                // ---------------------------------------------------
                // PAYMENT-BASED REWARDS
                // ---------------------------------------------------
                let pointsEarned = 0;
                let totalPoints = 0;

                // Calculate points based on seller's reward configuration
                pointsEarned = calculateRewardPoints(amount, seller);

                // Allocate reward points
                const pointsRef = db.collection("points");
                const pointsQuery = await pointsRef
                    .where("user_id", "==", currentUser.uid)
                    .where("seller_id", "==", sellerId)
                    .limit(1)
                    .get();

                if (!pointsQuery.empty) {
                    const docRef = pointsQuery.docs[0].ref;
                    const current = pointsQuery.docs[0].data().points || 0;

                    totalPoints = current + pointsEarned;
                    await docRef.update({
                        points: totalPoints,
                        last_updated: new Date()
                    });
                } else {
                    totalPoints = pointsEarned;
                    await pointsRef.add({
                        user_id: currentUser.uid,
                        seller_id: sellerId,
                        points: pointsEarned,
                        last_updated: new Date()
                    });
                }

                // Add transaction history
                await db.collection("transactions").add({
                    user_id: currentUser.uid,
                    seller_id: sellerId,
                    seller_name: sellerName,
                    points: pointsEarned,
                    amount: amount,
                    transaction_type: "earn",
                    qr_type: "payment",
                    timestamp: new Date(),
                    description: `Payment of ₹${amount} - earned ${pointsEarned} points`
                });

                // 🔥 UPDATE SELLER STATS for payment
                await updateSellerStats(sellerId, pointsEarned, newCustomer);

                // ---------------------------------------------------
                // RESPONSE
                // ---------------------------------------------------
                return res.status(200).json({
                    success: true,
                    message: "Payment verified and rewards credited",
                    points_earned: pointsEarned,
                    total_points: totalPoints,
                    seller_name: sellerName,
                    reward_applied: pointsEarned > 0,
                });

            } catch (error: any) {
                console.error("verifyPaymentForUser ERROR:", error);
                return res.status(500).json({ error: error.message });
            }
        });
    }
);