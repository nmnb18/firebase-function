import { Request, Response, NextFunction } from "express";
import Razorpay from "razorpay";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { PLAN_CONFIG } from "../../utils/constant";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const createOrderHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
                const { planId, sellerId, couponCode } = req.body;

                // Authenticate
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }

                if (!planId || !sellerId) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Missing required fields", HttpStatus.BAD_REQUEST);
                }

                // Validate plan
                const plan = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG];
                if (!plan) {
                    return sendError(res, ErrorCodes.INVALID_INPUT, "Invalid plan", HttpStatus.BAD_REQUEST);
                }

                let finalAmount = plan.price;
                let discountAmount = 0;
                let appliedCoupon = null;

                // Apply coupon if provided
                if (couponCode) {
                    const couponResult = await validateAndApplyCoupon(couponCode, planId, sellerId, plan.price);
                    if (couponResult.success) {
                        finalAmount = couponResult.finalAmount;
                        discountAmount = couponResult.discountAmount;
                        appliedCoupon = couponResult.coupon;
                    }
                    // Note: We don't fail if coupon is invalid, just proceed without discount
                }

                // Convert to paise (Razorpay expects amount in paise)
                const amountInPaise = Math.round(finalAmount * 100);

                const env = process.env.RAZORPAY_ENV || "test";

                const key_id =
                    env === "live"
                        ? process.env.RAZORPAY_KEY_ID_LIVE!
                        : process.env.RAZORPAY_KEY_ID_TEST!;

                const key_secret =
                    env === "live"
                        ? process.env.RAZORPAY_SECRET_LIVE!
                        : process.env.RAZORPAY_SECRET_TEST!;

                const razorpay = new Razorpay({
                    key_id,
                    key_secret,
                });

                const options = {
                    amount: amountInPaise,
                    currency: "INR",
                    receipt: `GBT-ORD-${sellerId.slice(0, 6)}-${Date.now().toString().slice(-6)}`,
                };

                const order = await razorpay.orders.create(options);

                // Store pending order with coupon info
                const orderData: any = {
                    sellerId,
                    planId,
                    amount: amountInPaise,
                    originalAmount: plan.price * 100, // Store in paise for consistency
                    order_id: order.id,
                    currency: "INR",
                    status: "created",
                    created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                };

                if (appliedCoupon) {
                    orderData.coupon = {
                        code: appliedCoupon.code,
                        discountAmount: discountAmount * 100, // Store in paise
                        couponId: appliedCoupon.id,
                    };
                }

                await db.collection("payments").doc(order.id).set(orderData);

                return sendSuccess(res, {
                    order_id: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    key_id: key_id,
                    couponApplied: !!appliedCoupon,
                    discountAmount,
                    finalAmount: finalAmount,
                    originalAmount: plan.price,
                }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};

// Helper function to validate and apply coupon
async function validateAndApplyCoupon(couponCode: string, planId: string, sellerId: string, planPrice: number) {
    try {
        const couponsSnapshot = await db
            .collection("coupons")
            .where("code", "==", couponCode.toUpperCase().trim())
            .where("isActive", "==", true)
            .where("validFrom", "<=", adminRef.firestore.Timestamp.now())
            .where("validUntil", ">=", adminRef.firestore.Timestamp.now())
            .limit(1)
            .get();

        if (couponsSnapshot.empty) {
            throw new Error("Invalid coupon");
        }

        const couponDoc = couponsSnapshot.docs[0];
        const coupon = couponDoc.data();

        // Check usage limit
        if (coupon.usedCount >= coupon.usageLimit) {
            throw new Error("Coupon usage limit reached");
        }

        // Check plan applicability
        if (coupon.applicablePlans && !coupon.applicablePlans.includes(planId)) {
            throw new Error("Coupon not valid for this plan");
        }

        // Check minimum amount
        if (coupon.minAmount && planPrice < coupon.minAmount) {
            throw new Error(`Minimum amount ₹${coupon.minAmount} required`);
        }

        // Calculate discount
        let discountAmount = 0;
        if (coupon.discountType === "percentage") {
            discountAmount = (planPrice * coupon.discountValue) / 100;
            if (coupon.maxDiscount) {
                discountAmount = Math.min(discountAmount, coupon.maxDiscount);
            }
        } else {
            discountAmount = coupon.discountValue;
        }

        discountAmount = Math.min(discountAmount, planPrice);
        const finalAmount = Math.max(planPrice - discountAmount, 0);

        return {
            success: true,
            coupon: {
                id: couponDoc.id,
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
            },
            discountAmount,
            finalAmount
        };

    } catch (error) {
        // Return failure but don't throw - let order proceed without coupon
        return {
            success: false,
            discountAmount: 0,
            finalAmount: planPrice
        };
    }
}