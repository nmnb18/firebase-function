import { Request, Response } from "express";
import cors from "cors";
import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { generateInternalOrderId } from "../../utils/helper";
import { PLAN_CONFIG } from "../../utils/constant";

const corsHandler = cors({ origin: true });


export const verifyPaymentHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Only POST allowed" });
            }

            try {
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
                    couponCode,
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

                // Verify Razorpay signature
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

                const plan = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG];
                if (!plan) {
                    return res.status(400).json({ success: false, error: "Invalid plan" });
                }

                // Get payment record to check for coupon
                const paymentDoc = await db.collection("payments").doc(razorpay_order_id).get();
                if (!paymentDoc.exists) {
                    return res.status(400).json({ success: false, error: "Order not found" });
                }

                const paymentData = paymentDoc.data();
                const couponUsed = paymentData?.coupon;
                const amountPaid = paymentData?.amount ? paymentData.amount / 100 : plan.price; // Convert from paise

                const now = new Date();
                const expiryDate = new Date(
                    now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
                );

                const internalOrderId = await generateInternalOrderId();

                // ATOMIC BATCH WRITE: payment + coupon usage + seller profile + subscription + history
                const batch = db.batch();

                // 1. Update payment record
                const paymentRef = db.collection("payments").doc(razorpay_order_id);
                const paymentUpdate: any = {
                    status: "paid",
                    razorpay_payment_id,
                    razorpay_signature,
                    verified_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    plan_id: planId,
                    amount_paid: amountPaid,
                    environment: env,
                };

                if (couponUsed) {
                    paymentUpdate.coupon = {
                        ...couponUsed,
                        appliedAt: adminRef.firestore.FieldValue.serverTimestamp()
                    };
                }

                batch.update(paymentRef, paymentUpdate);

                // 2. Update coupon usage if coupon was applied
                if (couponUsed) {
                    const couponRef = db.collection("coupons").doc(couponUsed.couponId);
                    batch.update(couponRef, {
                        usedCount: adminRef.firestore.FieldValue.increment(1),
                        lastUsedAt: adminRef.firestore.FieldValue.serverTimestamp(),
                    });

                    const usageRef = db.collection("coupon_usage").doc();
                    batch.set(usageRef, {
                        couponId: couponUsed.couponId,
                        sellerId,
                        orderId: internalOrderId,
                        discountAmount: couponUsed.discountAmount / 100,
                        usedAt: adminRef.firestore.FieldValue.serverTimestamp(),
                    });
                }

                // 3. Update seller profile
                const sellerRef = db.collection("seller_profiles").doc(sellerId);
                batch.update(sellerRef, {
                    subscription: {
                        tier: planId,
                        expires_at: adminRef.firestore.Timestamp.fromDate(expiryDate),
                        qr_limit: plan.monthly_qr_limit,
                        updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                        last_payment: {
                            order_id: internalOrderId,
                            razorpay_order_id,
                            payment_id: razorpay_payment_id,
                            amount: amountPaid,
                            environment: env,
                            paid_at: adminRef.firestore.FieldValue.serverTimestamp(),
                            coupon_used: couponUsed ? couponUsed.code : null,
                            discount_amount: couponUsed ? couponUsed.discountAmount / 100 : 0
                        }
                    }
                });

                // 4. Update subscription record
                const subscriptionRef = db.collection("seller_subscriptions").doc(sellerId);
                batch.set(
                    subscriptionRef,
                    {
                        tier: planId,
                        status: "active",
                        price: amountPaid,
                        original_price: plan.price,
                        monthly_qr_limit: plan.monthly_qr_limit,
                        current_period_start: adminRef.firestore.FieldValue.serverTimestamp(),
                        current_period_end: adminRef.firestore.Timestamp.fromDate(expiryDate),
                        order_id: internalOrderId,
                        updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                        coupon_used: couponUsed ? couponUsed.code : null,
                        discount_amount: couponUsed ? couponUsed.discountAmount / 100 : 0
                    },
                    { merge: true }
                );

                // 5. Create subscription history entry
                const historyRef = db
                    .collection("subscription_history")
                    .doc(sellerId)
                    .collection("records")
                    .doc();

                const historyData: any = {
                    internal_order_id: internalOrderId,
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature,
                    plan_id: planId,
                    seller_id: sellerId,
                    amount: amountPaid,
                    original_amount: plan.price,
                    environment: env,
                    status: "paid",
                    paid_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    expires_at: adminRef.firestore.Timestamp.fromDate(expiryDate),
                };

                if (couponUsed) {
                    historyData.coupon = {
                        code: couponUsed.code,
                        discount_amount: couponUsed.discountAmount / 100,
                    };
                }

                batch.set(historyRef, historyData);

                // Commit all writes atomically
                await batch.commit();

                return res.status(200).json({
                    success: true,
                    message: "Payment verified successfully",
                    subscription: {
                        plan: planId,
                        order_id: internalOrderId,
                        expires_at: expiryDate.toISOString(),
                        monthly_qr_limit: plan.monthly_qr_limit,
                        amount_paid: amountPaid,
                        original_amount: plan.price,
                        discount_amount: couponUsed ? couponUsed.discountAmount / 100 : 0,
                        coupon_used: couponUsed ? couponUsed.code : null,
                    },
                });
            } catch (error: any) {
                console.error("Payment verification error:", error);
                return res
                    .status(500)
                    .json({ success: false, error: error.message || "Internal error" });
            }
        });
};

// Helper function removed - coupon usage now part of main atomic batch