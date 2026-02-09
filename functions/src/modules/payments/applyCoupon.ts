import * as functions from "firebase-functions";
import cors from "cors";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { PLAN_CONFIG } from "../../utils/constant";

const corsHandler = cors({ origin: true });

// In-memory cache for coupon validation (keyed by code+planId+sellerId, 60s)
const couponCache: { [key: string]: { data: any, expires: number } } = {};
export const applyCoupon = functions.https.onRequest(
    { region: 'asia-south1', memory: '256MiB', timeoutSeconds: 20 }, async (req: any, res: any) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Only POST allowed" });
            }

            try {
                // Authenticate user
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                const { couponCode, planId, sellerId } = req.body;
                if (!couponCode || !planId || !sellerId) {
                    return res.status(400).json({
                        success: false,
                        message: "Missing required fields"
                    });
                }
                // Caching
                const cacheKey = `${couponCode}_${planId}_${sellerId}`;
                if (couponCache[cacheKey] && couponCache[cacheKey].expires > Date.now()) {
                    return res.status(200).json(couponCache[cacheKey].data);
                }
                // Validate plan
                const plan = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG];
                if (!plan) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid plan selected"
                    });
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
                    return res.status(400).json({
                        success: false,
                        message: "Invalid or expired coupon code"
                    });
                }
                const couponDoc = couponsSnapshot.docs[0];
                const coupon = couponDoc.data();

                // Check usage limit
                if (coupon.usedCount >= coupon.usageLimit) {
                    return res.status(400).json({
                        success: false,
                        message: "This coupon has reached its usage limit"
                    });
                }

                // Check if coupon applies to this plan
                if (coupon.applicablePlans && !coupon.applicablePlans.includes(planId)) {
                    return res.status(400).json({
                        success: false,
                        message: "This coupon is not valid for the selected plan"
                    });
                }

                // Check minimum amount requirement
                if (coupon.minAmount && planPrice < coupon.minAmount) {
                    return res.status(400).json({
                        success: false,
                        message: `Minimum order amount of ₹${coupon.minAmount} required for this coupon`
                    });
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
                    return res.status(400).json({
                        success: false,
                        message: "You have already used this coupon"
                    });
                }

                return res.status(200).json({
                    success: true,
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
                });

            } catch (error: any) {
                console.error("Apply coupon error:", error);
                return res.status(500).json({
                    success: false,
                    message: "Failed to apply coupon"
                });
            }
        });
    });