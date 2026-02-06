import { createCallableFunction } from "../../utils/callable";
import Razorpay from "razorpay";
import { db, adminRef } from "../../config/firebase";

interface CreateOrderForUserRequest {
    sellerId: string;
    amount: number;
    qr_id?: string;
    reason?: string;
    payment_mode?: string;
}

export const createOrderForUser = createCallableFunction<
    CreateOrderForUserRequest,
    any
>(
    async (data, auth, context) => {
        const {
            sellerId,
            amount,
            qr_id,
            reason = "store_payment",
            payment_mode = "upi",
        } = data;

        const userId = auth!.uid;

        if (!sellerId || !amount) {
            throw new Error("sellerId and amount are required");
        }

        const amountPaise = Math.round(amount * 100); // convert to paise

        // Razorpay Key Select
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

        // Create Order
        const options: any = {
            amount: amountPaise,
            currency: "INR",
            receipt: `GBT-USER-${userId.slice(0, 6)}-${Date.now()
                .toString()
                .slice(-6)}`,
            notes: {
                sellerId,
                userId,
                qr_id,
                payment_mode,
                reason,
            },
        };

        const order: any = await razorpay.orders.create(options);

        // Save initial payment record
        await db.collection("user_payments").doc(order.id).set({
            user_id: userId,
            seller_id: sellerId,
            qr_id: qr_id || null,
            payment_mode,
            reason,
            order_id: order.id,
            amount: amountPaise,
            currency: "INR",
            status: "created",
            created_at: adminRef.firestore.FieldValue.serverTimestamp(),
        });

        // Response
        return {
            success: true,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: key_id,
        };
    },
    {
        region: "asia-south1",
        requireAuth: true,
        secrets: [
            "RAZORPAY_ENV",
            "RAZORPAY_KEY_ID_TEST",
            "RAZORPAY_SECRET_TEST",
        ],
    }
);
