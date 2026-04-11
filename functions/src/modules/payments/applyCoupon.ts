import { Request, Response, NextFunction } from "express";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { PLAN_CONFIG } from "../../utils/constant";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

// In-memory cache for coupon validation (keyed by code+planId+sellerId, 60s)
const couponCache: { [key: string]: { data: any, expires: number } } = {};

export const applyCouponHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
                // Authenticate user
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }
                const { couponCode, planId, sellerId } = req.body;
                if (!couponCode || !planId || !sellerId) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Missing required fields", HttpStatus.BAD_REQUEST);
                }
                // Caching
                const cacheKey = `${couponCode}_${planId}_${sellerId}`;
                if (couponCache[cacheKey] && couponCache[cacheKey].expires > Date.now()) {
                    return sendSuccess(res, couponCache[cacheKey].data, HttpStatus.OK);
                }
                // Validate plan
                const plan = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG];
                if (!plan) {
                    return sendError(res, ErrorCodes.INVALID_INPUT, "Invalid plan selected", HttpStatus.BAD_REQUEST);
                }
                const planPrice = plan.price;
                // Find active coupon
                const couponsSnapshot = await db
                    .collection("coupons")
                    .where("code", "==", couponCode.toUpperCase().trim())
                    .where("isActive", "==", true)
                    .where("validFrom", "<=", adminRef.firestore.Timestamp.now())
                    .where("validUntil", ">=", adminRef.firestore.Timestamp.now())
                    .limit(1)
                    .get();
                if (couponsSnapshot.empty) {
                    return sendError(res, ErrorCodes.COUPON_INVALID, "Invalid or expired coupon code", HttpStatus.BAD_REQUEST);
                }
                const couponDoc = couponsSnapshot.docs[0];
                const coupon = couponDoc.data();

                // Check usage limit
                if (coupon.usedCount >= coupon.usageLimit) {
                    return sendError(res, ErrorCodes.LIMIT_EXCEEDED, "This coupon has reached its usage limit", HttpStatus.BAD_REQUEST);
                }

                // Check if coupon applies to this plan
                if (coupon.applicablePlans && !coupon.applicablePlans.includes(planId)) {
                    return sendError(res, ErrorCodes.COUPON_INVALID, "This coupon is not valid for the selected plan", HttpStatus.BAD_REQUEST);
                }

                // Check minimum amount requirement
                if (coupon.minAmount && planPrice < coupon.minAmount) {
                    return sendError(res, ErrorCodes.INVALID_INPUT, `Minimum order amount of \u20B9${coupon.minAmount} required for this coupon`, HttpStatus.BAD_REQUEST);
                }

                // Calculate discount amount
                let discountAmount = 0;
                if (coupon.discountType === "percentage") {
                    discountAmount = (planPrice * coupon.discountValue) / 100;
                    // Apply max discount limit if specified
                    if (coupon.maxDiscount) {
                        discountAmount = Math.min(discountAmount, coupon.maxDiscount);
                    }
                } else {
                    // Fixed amount discount
                    discountAmount = coupon.discountValue;
                }

                // Ensure discount doesn't exceed plan price
                discountAmount = Math.min(discountAmount, planPrice);
                const finalAmount = Math.max(planPrice - discountAmount, 0);

                // Check if user has already used this coupon
                const userUsageSnapshot = await db
                    .collection("coupon_usage")
                    .where("couponId", "==", couponDoc.id)
                    .where("sellerId", "==", sellerId)
                    .limit(1)
                    .get();

                if (!userUsageSnapshot.empty && coupon.oneTimeUse) {
                    return sendError(res, ErrorCodes.COUPON_INVALID, "You have already used this coupon", HttpStatus.BAD_REQUEST);
                }

                return sendSuccess(res, {
                    coupon: {
                        id: couponDoc.id,
                        code: coupon.code,
                        discountType: coupon.discountType,
                        discountValue: coupon.discountValue,
                        discountAmount: Math.round(discountAmount),
                        minAmount: coupon.minAmount,
                        maxDiscount: coupon.maxDiscount,
                        oneTimeUse: coupon.oneTimeUse || false,
                    },
                    discountAmount: Math.round(discountAmount),
                    finalAmount: Math.round(finalAmount),
                    originalAmount: planPrice,
                    message: `Coupon applied successfully! ₹${Math.round(discountAmount)} discount`
                }, HttpStatus.OK);

    } catch (err) {
        next(err);
    }
};
