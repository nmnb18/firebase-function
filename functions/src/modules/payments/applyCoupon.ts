import { createCallableFunction } from "../../utils/callable";
import { db, adminRef } from "../../config/firebase";
import { PLAN_CONFIG } from "../../utils/constant";

interface ApplyCouponRequest {
  couponCode: string;
  planId: string;
  sellerId: string;
}

export const applyCoupon = createCallableFunction<ApplyCouponRequest, any>(
  async (data, auth) => {
    const { couponCode, planId, sellerId } = data;

    if (!couponCode || !planId || !sellerId) {
      throw new Error("Missing required fields");
    }

    // Validate plan
    const plan = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG];
    if (!plan) {
      throw new Error("Invalid plan selected");
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
      throw new Error("Invalid or expired coupon code");
    }

    const couponDoc = couponsSnapshot.docs[0];
    const coupon = couponDoc.data();

    // Check usage limit
    if (coupon.usedCount >= coupon.usageLimit) {
      throw new Error("This coupon has reached its usage limit");
    }

    // Check if coupon applies to this plan
    if (
      coupon.applicablePlans &&
      !coupon.applicablePlans.includes(planId)
    ) {
      throw new Error("This coupon is not valid for the selected plan");
    }

    // Check minimum amount requirement
    if (coupon.minAmount && planPrice < coupon.minAmount) {
      throw new Error(
        `Minimum order amount of ₹${coupon.minAmount} required for this coupon`
      );
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
      throw new Error("You have already used this coupon");
    }

    return {
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
      message: `Coupon applied successfully! ₹${Math.round(discountAmount)} discount`,
    };
  },
  { region: "asia-south1", requireAuth: true }
);