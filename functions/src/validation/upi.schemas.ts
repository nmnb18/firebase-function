import { z } from "zod";

export const createUPIPaymentOrderSchema = z.object({
    seller_id: z.string().min(1, "seller_id required"),
    /** Amount in paise — must be a positive integer */
    amount: z
        .number({ required_error: "amount required" })
        .int("amount must be an integer (paise)")
        .positive("amount must be positive"),
});

export const confirmUPIPaymentSchema = z.object({
    razorpay_payment_id: z.string().min(1, "razorpay_payment_id required"),
    razorpay_order_id: z.string().min(1, "razorpay_order_id required"),
    razorpay_signature: z.string().min(1, "razorpay_signature required"),
    seller_id: z.string().min(1, "seller_id required"),
});

export const scanUserQRCodeSchema = z.object({
    token: z.string().min(1, "token required"),
    amount: z.number().nonnegative().max(100000).optional().default(0),
});
