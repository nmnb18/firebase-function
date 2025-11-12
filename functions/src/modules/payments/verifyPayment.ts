import * as functions from "firebase-functions";
import cors from "cors";
import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";

const corsHandler = cors({ origin: true });

export const verifyPayment = functions.https.onRequest(
    { secrets: ["RAZORPAY_ENV", "RAZORPAY_SECRET_LIVE", "RAZORPAY_SECRET_TEST"] },
    async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Only POST allowed" });
            }

            try {
                const { razorpay_order_id, razorpay_payment_id, razorpay_signature, sellerId, plan } = req.body;

                if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                    return res.status(400).json({ error: "Missing required parameters" });
                }

                const env = process.env.RAZORPAY_ENV || "test";

                const key_secret =
                    env === "live"
                        ? process.env.RAZORPAY_SECRET_LIVE!
                        : process.env.RAZORPAY_SECRET_TEST!;

                const sign = razorpay_order_id + "|" + razorpay_payment_id;
                const expectedSignature = crypto
                    .createHmac("sha256", key_secret)
                    .update(sign)
                    .digest("hex");

                if (expectedSignature !== razorpay_signature) {
                    return res.status(400).json({ success: false, error: "Invalid signature" });
                }

                // ✅ Signature valid → update Firestore
                await db.collection("payments").doc(razorpay_order_id).update({
                    status: "paid",
                    razorpay_payment_id,
                    razorpay_signature,
                    verified_at: adminRef.firestore.FieldValue.serverTimestamp(),
                });

                // Update subscription
                await db.collection("seller_profiles").doc(sellerId).update({
                    subscription_tier: plan,
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                });

                await db.collection("seller_subscriptions").doc(sellerId).update({
                    tier: plan,
                    status: "active",
                    current_period_start: adminRef.firestore.FieldValue.serverTimestamp(),
                    current_period_end: adminRef.firestore.Timestamp.fromDate(
                        new Date(Date.now() + (plan === "premium" ? 365 : 30) * 24 * 60 * 60 * 1000)
                    ),
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                });

                return res.status(200).json({ success: true, message: "Payment verified successfully" });
            } catch (error: any) {
                console.error("Payment verification error:", error);
                return res.status(500).json({ success: false, error: error.message });
            }
        });
    }
);
