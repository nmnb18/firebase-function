import { z } from "zod";

export const createOrderSchema = z.object({
    planId: z.string().min(1, "planId required"),
    sellerId: z.string().min(1, "sellerId required"),
    couponCode: z.string().optional(),
});

export const verifyPaymentSchema = z.object({
    razorpay_order_id: z.string().min(1, "razorpay_order_id required"),
    razorpay_payment_id: z.string().min(1, "razorpay_payment_id required"),
    razorpay_signature: z.string().min(1, "razorpay_signature required"),
    planId: z.string().min(1, "planId required"),
    sellerId: z.string().optional(),
    couponCode: z.string().optional(),
});

export const applyCouponSchema = z.object({
    couponCode: z.string().min(1, "couponCode required"),
    planId: z.string().min(1, "planId required"),
    sellerId: z.string().min(1, "sellerId required"),
});

export const verifyIAPPurchaseSchema = z.object({
    purchaseToken: z.string().min(1, "purchaseToken required"),
    productId: z.string().min(1, "productId required"),
    transactionId: z.string().min(1, "transactionId required"),
});
