import { Request, Response } from "express";
import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";
import { calculateRewardPoints } from "../../utils/calculate-reward-points";
import {
    isNewCustomer,
    updateSellerStats,
    updatePointsCollection,
    createDailyScanRecord,
    sendPointsEarnedNotifications,
    activateUserIfFirstTime,
    createPointsEarningTransaction,
} from "../../utils/points-transaction-helpers";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const razorpayWebhookHandler = async (req: Request, res: Response): Promise<void> => {
    try {
            // ── 1. Verify webhook signature ────────────────────────────────────────────
            const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
            if (!webhookSecret) {
                console.error("RAZORPAY_WEBHOOK_SECRET is not set");
                return sendError(res, ErrorCodes.INTERNAL_ERROR, "Webhook secret not configured", HttpStatus.INTERNAL_SERVER_ERROR);
            }

            const razorpaySignature = req.headers["x-razorpay-signature"] as string;
            if (!razorpaySignature) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Missing X-Razorpay-Signature header", HttpStatus.BAD_REQUEST);
            }

            const rawBody: Buffer | undefined = (req as any).rawBody;
            if (!rawBody) {
                return sendError(res, ErrorCodes.INVALID_INPUT, "Raw body unavailable", HttpStatus.BAD_REQUEST);
            }

            const expectedSignature = crypto
                .createHmac("sha256", webhookSecret)
                .update(rawBody)
                .digest("hex");

            if (expectedSignature !== razorpaySignature) {
                return sendError(res, ErrorCodes.INVALID_PAYMENT_SIGNATURE, "Invalid webhook signature", HttpStatus.BAD_REQUEST);
            }

            // ── 2. Parse event ─────────────────────────────────────────────────────────
            const event = req.body;
            if (event.event !== "payment.captured") {
                // Acknowledge unhandled events without processing
                return sendSuccess(res, { received: true }, HttpStatus.OK);
            }

            const paymentEntity = event.payload?.payment?.entity;
            if (!paymentEntity) {
                return sendError(res, ErrorCodes.INVALID_INPUT, "Malformed webhook payload", HttpStatus.BAD_REQUEST);
            }

            const razorpay_order_id: string = paymentEntity.order_id;
            const razorpay_payment_id: string = paymentEntity.id;

            if (!razorpay_order_id || !razorpay_payment_id) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Missing order_id or payment_id in payload", HttpStatus.BAD_REQUEST);
            }

            // ── 3. Idempotency guard ───────────────────────────────────────────────────
            const orderRef = db.collection("upi_payment_orders").doc(razorpay_order_id);
            const orderDoc = await orderRef.get();

            if (!orderDoc.exists) {
                // Not a Turbo UPI order managed by this app — ignore silently
                return sendSuccess(res, { received: true }, HttpStatus.OK);
            }

            const order = orderDoc.data()!;
            if (order.status !== "pending") {
                // Already handled (either by confirmUPIPaymentAndAwardPoints or a previous webhook)
                return sendSuccess(res, { received: true, skipped: "already_processed" }, HttpStatus.OK);
            }

            // ── 4. Fetch seller ────────────────────────────────────────────────────────
            const sellerDoc = await db.collection("seller_profiles").doc(order.seller_id).get();
            if (!sellerDoc.exists) {
                console.error(`razorpayWebhook: seller ${order.seller_id} not found for order ${razorpay_order_id}`);
                return sendSuccess(res, { received: true, skipped: "seller_not_found" }, HttpStatus.OK);
            }
            const seller = sellerDoc.data()!;
            const sellerName: string = seller.business?.shop_name || "";

            // ── 5. Calculate points + check first-time bonus ──────────────────────────
            const amountINR = order.amount / 100;
            let pointsEarned = calculateRewardPoints(amountINR, seller);

            const newCustomer = await isNewCustomer(order.user_id, order.seller_id);
            let isFirstScanBonus = false;
            if (
                newCustomer &&
                seller?.rewards?.first_scan_bonus?.enabled &&
                seller?.rewards?.first_scan_bonus?.points > 0
            ) {
                // Ensure bonus points are integer (defensive rounding)
                pointsEarned += Math.round(seller.rewards.first_scan_bonus.points);
                isFirstScanBonus = true;
            }

            // ── 6. Atomic batch write (using shared utility) ──────────────────────────
            await createPointsEarningTransaction({
                userId: order.user_id,
                sellerId: order.seller_id,
                sellerName,
                pointsEarned,
                basePoints: calculateRewardPoints(amountINR, seller),
                bonusPoints: isFirstScanBonus ? Math.round(seller.rewards.first_scan_bonus.points) : 0,
                transactionType: "upi_payment",
                amount: order.amount,
                description: isFirstScanBonus
                    ? `Earned ${pointsEarned} points (including first scan bonus)`
                    : `Earned ${pointsEarned} points`,
                razorpayOrderId: razorpay_order_id,
                razorpayPaymentId: razorpay_payment_id,
                orderRef,
                completedVia: "webhook",
            });

            const customerRef = db.collection("customer_profiles").doc(order.user_id);

            // ── 7. Post-transaction operations (points, daily_scans, stats, notifications) ─────
            const updatedCustomer = await customerRef.get();
            const customerName: string = updatedCustomer.data()?.account?.name || "Customer";

            await Promise.all([
                updatePointsCollection(order.user_id, order.seller_id, pointsEarned),
                createDailyScanRecord(order.user_id, order.seller_id, "upi_payment"),
                updateSellerStats(order.seller_id, pointsEarned, newCustomer, isFirstScanBonus),
                sendPointsEarnedNotifications(order.user_id, order.seller_id, pointsEarned, sellerName, customerName),
                activateUserIfFirstTime(order.user_id, order.seller_id),
            ]);

            return sendSuccess(res, { received: true, points_awarded: pointsEarned }, HttpStatus.OK);
    } catch (error: any) {
        console.error("razorpayWebhook error:", error);
        // Always 200 to Razorpay to prevent retries on server errors
        res.status(200).json({ received: true, error: "Internal processing error" });
    }
};
