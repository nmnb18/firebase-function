import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";
import { calculateDistance } from "../../utils/qr-helper";
import { createCallableFunction } from "../../utils/callable";

interface VerifyPaymentForUserInput {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    sellerId: string;
    amount: number;
    user_lat?: number;
    user_lng?: number;
}

interface VerifyPaymentForUserOutput {
    success: boolean;
    message: string;
    points_earned: number;
    total_points: number;
    seller_name: string;
    reward_applied: boolean;
}

/** UPDATE SELLER STATS */
async function updateSellerStats(sellerId: string, pointsEarned: number, isNewCustomer: boolean = false) {
    const sellerRef = db.collection("seller_profiles").doc(sellerId);

    const now = new Date();
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const currentMonthKey = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();
    const monthlyScanKey = `stats.monthly_scans.${currentYear}.${currentMonthKey}`;

    const sellerDoc = await sellerRef.get();
    const sellerData = sellerDoc.data();

    const updateData: any = {
        "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
        "stats.total_points_distributed": adminRef.firestore.FieldValue.increment(pointsEarned)
    };

    const currentMonthlyScans = sellerData?.stats?.monthly_scans || {};
    const currentYearScans = currentMonthlyScans[currentYear] || {};
    const currentMonthCount = currentYearScans[currentMonthKey] || 0;

    updateData[monthlyScanKey] = currentMonthCount + 1;

    if (isNewCustomer) {
        updateData["stats.active_customers"] = adminRef.firestore.FieldValue.increment(1);
    }

    await sellerRef.update(updateData);
}

/** CHECK IF USER IS NEW CUSTOMER FOR THIS SELLER */
async function isNewCustomer(userId: string, sellerId: string): Promise<boolean> {
    const pointsQuery = await db.collection("points")
        .where("user_id", "==", userId)
        .where("seller_id", "==", sellerId)
        .limit(1)
        .get();

    return pointsQuery.empty;
}

/** UNIVERSAL REWARD CALCULATOR */
function calculateRewardPoints(amount: number, seller: any): number {
    const config = seller.rewards || {};

    switch (config.reward_type) {
        case "percentage":
            if (!config.percentage_value) return 0;
            return Math.round((config.percentage_value / 100) * amount);
        case "flat":
            return config.flat_points || 0;
        case "slab":
            if (!Array.isArray(config.slab_rules)) return 0;
            for (const rule of config.slab_rules) {
                if (amount >= rule.min && amount <= rule.max) {
                    return rule.points;
                }
            }
            const last = config.slab_rules[config.slab_rules.length - 1];
            if (amount > last.max) return last.points;
            return 0;
        case "default":
        default:
            return config.default_points_value || 1;
    }
}

export const verifyPaymentForUser = createCallableFunction<VerifyPaymentForUserInput, VerifyPaymentForUserOutput>(
    async (data, auth, context) => {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            sellerId,
            amount,
            user_lat,
            user_lng
        } = data;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            throw new Error("Missing payment verification params");
        }

        if (!sellerId) {
            throw new Error("sellerId is required");
        }

        if (!amount) {
            throw new Error("Payment amount is required");
        }

        // Verify signature
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
            throw new Error("Invalid signature");
        }

        const sellerDoc = await db.collection("seller_profiles").doc(sellerId).get();
        if (!sellerDoc.exists) {
            throw new Error("Seller not found");
        }
        const seller = sellerDoc.data();

        // Location check
        if (seller?.location?.lat && seller?.location?.lng) {
            if (!user_lat || !user_lng) {
                throw new Error("Location is required");
            }

            const distance = calculateDistance(
                seller.location.lat,
                seller.location.lng,
                user_lat,
                user_lng
            );

            const maxDistance = seller.location_radius_meters || 100;

            if (distance > maxDistance) {
                throw new Error(`Too far from store. Must be within ${maxDistance}m`);
            }
        }

        // Mark payment as paid
        const paymentRef = db.collection("user_payments").doc(razorpay_order_id);
        const paymentSnap = await paymentRef.get();

        if (!paymentSnap.exists) {
            throw new Error("Payment not found");
        }

        await paymentRef.update({
            status: "paid",
            razorpay_payment_id,
            razorpay_signature,
            verified_at: adminRef.firestore.FieldValue.serverTimestamp(),
        });

        const sellerName = seller?.business?.shop_name || "Store";

        // Check if this is a new customer
        const newCustomer = await isNewCustomer(auth!.uid, sellerId);

        // Calculate reward points
        const pointsEarned = calculateRewardPoints(amount, seller);

        // Allocate reward points
        const pointsRef = db.collection("points");
        const pointsQuery = await pointsRef
            .where("user_id", "==", auth!.uid)
            .where("seller_id", "==", sellerId)
            .limit(1)
            .get();

        let totalPoints = 0;

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
                user_id: auth!.uid,
                seller_id: sellerId,
                points: pointsEarned,
                last_updated: new Date()
            });
        }

        // Add transaction history
        await db.collection("transactions").add({
            user_id: auth!.uid,
            seller_id: sellerId,
            seller_name: sellerName,
            points: pointsEarned,
            amount: amount,
            transaction_type: "earn",
            qr_type: "payment",
            timestamp: new Date(),
            description: `Payment of ₹${amount} - earned ${pointsEarned} points`
        });

        // Update seller stats
        await updateSellerStats(sellerId, pointsEarned, newCustomer);

        return {
            success: true,
            message: "Payment verified and rewards credited",
            points_earned: pointsEarned,
            total_points: totalPoints,
            seller_name: sellerName,
            reward_applied: pointsEarned > 0,
        };
    },
    {
        region: "asia-south1",
        requireAuth: true,
        secrets: ["RAZORPAY_ENV", "RAZORPAY_SECRET_TEST"]
    }
);