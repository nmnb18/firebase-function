import { createCallableFunction } from "../../utils/callable";
import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";
import { generateInternalOrderId } from "../../utils/helper";
import { PLAN_CONFIG } from "../../utils/constant";

// Helper function to update coupon usage
async function updateCouponUsage(
    couponId: string,
    sellerId: string,
    orderId: string,
    discountAmount: number
) {
    const batch = db.batch();

    // Increment coupon usage count
    const couponRef = db.collection("coupons").doc(couponId);
    batch.update(couponRef, {
        usedCount: adminRef.firestore.FieldValue.increment(1),
        lastUsedAt: adminRef.firestore.FieldValue.serverTimestamp(),
    });

    // Record coupon usage
    const usageRef = db.collection("coupon_usage").doc();
    batch.set(usageRef, {
        couponId,
        sellerId,
        orderId,
        discountAmount,
        usedAt: adminRef.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
}

interface VerifyPaymentRequest {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    sellerId: string;
    planId: string;
    couponCode?: string;
}

export const verifyPayment = createCallableFunction<VerifyPaymentRequest, any>(
    async (data, auth, context) => {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            sellerId,
            planId,
            couponCode,
        } = data;

        if (
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature ||
            !planId
        ) {
            throw new Error("Missing required parameters");
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
            throw new Error("Invalid signature");
        }

        const plan = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG];
        if (!plan) {
            throw new Error("Invalid plan");
        }

        // Get payment record to check for coupon
        const paymentDoc = await db
            .collection("payments")
            .doc(razorpay_order_id)
            .get();
        if (!paymentDoc.exists) {
            throw new Error("Order not found");
        }

        const paymentData = paymentDoc.data();
        const couponUsed = paymentData?.coupon;
        const amountPaid = paymentData?.amount ? paymentData.amount / 100 : plan.price; // Convert from paise

        const now = new Date();
        const expiryDate = new Date(
            now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
        );

        const internalOrderId = await generateInternalOrderId();

        // Update payment record
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
                appliedAt: adminRef.firestore.FieldValue.serverTimestamp(),
            };
        }

        await db
            .collection("payments")
            .doc(razorpay_order_id)
            .update(paymentUpdate);

        // Update coupon usage if coupon was applied
        if (couponUsed) {
            await updateCouponUsage(
                couponUsed.couponId,
                sellerId,
                internalOrderId,
                couponUsed.discountAmount / 100
            );
        }

        // Update seller profile and subscription in parallel
        await Promise.all([
            db.collection("seller_profiles").doc(sellerId).update({
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
                        discount_amount: couponUsed ? couponUsed.discountAmount / 100 : 0,
                    },
                },
            }),
            db
                .collection("seller_subscriptions")
                .doc(sellerId)
                .set(
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
                        discount_amount: couponUsed ? couponUsed.discountAmount / 100 : 0,
                    },
                    { merge: true }
                ),
        ]);

        // Create subscription history entry
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

        await db
            .collection("subscription_history")
            .doc(sellerId)
            .collection("records")
            .add(historyData);

        return {
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
        };
    },
    {
        region: "asia-south1",
        requireAuth: true,
        secrets: ["RAZORPAY_ENV", "RAZORPAY_SECRET_TEST"],
    }
);