import * as functions from "firebase-functions";
import cors from "cors";
import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

// Helper: plan metadata
const PLAN_CONFIG = {
    free: {
        durationDays: 30,
        price: 0,
        monthly_qr_limit: 10,
    },
    pro: {
        durationDays: 30, // 1 month
        price: 299,
        monthly_qr_limit: 999999, // practically unlimited
    },
    premium: {
        durationDays: 365, // 1 year
        price: 2999,
        monthly_qr_limit: 999999, // unlimited
    },
};

export const verifyPayment = functions.https.onRequest(
    { secrets: ["RAZORPAY_ENV", "RAZORPAY_SECRET_TEST"] },
    async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Only POST allowed" });
            }

            try {
                // 🔒 Authenticate Firebase user via Bearer token
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                const {
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature,
                    sellerId,
                    planId,
                } = req.body;

                if (
                    !razorpay_order_id ||
                    !razorpay_payment_id ||
                    !razorpay_signature ||
                    !planId
                ) {
                    return res
                        .status(400)
                        .json({ error: "Missing required parameters" });
                }

                const env = process.env.RAZORPAY_ENV || "test";
                const key_secret =
                    env === "live"
                        ? process.env.RAZORPAY_SECRET_LIVE!
                        : process.env.RAZORPAY_SECRET_TEST!;

                // ✅ Verify Razorpay signature
                const sign = razorpay_order_id + "|" + razorpay_payment_id;
                const expectedSignature = crypto
                    .createHmac("sha256", key_secret)
                    .update(sign)
                    .digest("hex");

                if (expectedSignature !== razorpay_signature) {
                    return res
                        .status(400)
                        .json({ success: false, error: "Invalid signature" });
                }

                // Plan validation
                const plan = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG];
                if (!plan) {
                    return res.status(400).json({ success: false, error: "Invalid plan" });
                }

                const now = new Date();
                const expiryDate = new Date(
                    now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
                );

                // ✅ Mark payment as successful
                await db.collection("payments").doc(razorpay_order_id).update({
                    status: "paid",
                    razorpay_payment_id,
                    razorpay_signature,
                    verified_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    plan_id: planId,
                    amount_paid: plan.price,
                    environment: env,
                });

                // ✅ Update seller profile with new plan info
                await db.collection("seller_profiles").doc(sellerId).update({
                    subscription_tier: planId,
                    subscription_expiry: adminRef.firestore.Timestamp.fromDate(expiryDate),
                    monthly_qr_limit: plan.monthly_qr_limit,
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                });

                // ✅ Update subscription record
                await db.collection("seller_subscriptions").doc(sellerId).set(
                    {
                        tier: planId,
                        status: "active",
                        price: plan.price,
                        monthly_qr_limit: plan.monthly_qr_limit,
                        current_period_start:
                            adminRef.firestore.FieldValue.serverTimestamp(),
                        current_period_end: adminRef.firestore.Timestamp.fromDate(
                            expiryDate
                        ),
                        updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );

                return res.status(200).json({
                    success: true,
                    message: "Payment verified successfully",
                    subscription: {
                        plan: planId,
                        expires_at: expiryDate.toISOString(),
                        monthly_qr_limit: plan.monthly_qr_limit,
                    },
                });
            } catch (error: any) {
                console.error("Payment verification error:", error);
                return res
                    .status(500)
                    .json({ success: false, error: error.message || "Internal error" });
            }
        });
    }
);
