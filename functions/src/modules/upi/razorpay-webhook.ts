import { Request, Response } from "express";
import cors from "cors";
import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";
import { calculateRewardPoints } from "../../utils/calculate-reward-points";

const corsHandler = cors({ origin: true });

/**
 * POST /razorpayWebhook
 *
 * Receives Razorpay webhook events and awards loyalty points on
 * "payment.captured". Uses its own signature verification via
 * X-Razorpay-Signature and RAZORPAY_WEBHOOK_SECRET — no Firebase auth.
 *
 * Fully idempotent: safe to receive the same event multiple times.
 * Raw body is attached as (req as any).rawBody by the express.json verify
 * callback registered in app.ts.
 */
export const razorpayWebhookHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "POST only" });
        }

        try {
            // ── 1. Verify webhook signature ────────────────────────────────────────────
            const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
            if (!webhookSecret) {
                console.error("RAZORPAY_WEBHOOK_SECRET is not set");
                return res.status(500).json({ error: "Webhook secret not configured" });
            }

            const razorpaySignature = req.headers["x-razorpay-signature"] as string;
            if (!razorpaySignature) {
                return res.status(400).json({ error: "Missing X-Razorpay-Signature header" });
            }

            const rawBody: Buffer | undefined = (req as any).rawBody;
            if (!rawBody) {
                return res.status(400).json({ error: "Raw body unavailable" });
            }

            const expectedSignature = crypto
                .createHmac("sha256", webhookSecret)
                .update(rawBody)
                .digest("hex");

            if (expectedSignature !== razorpaySignature) {
                return res.status(400).json({ error: "Invalid webhook signature" });
            }

            // ── 2. Parse event ─────────────────────────────────────────────────────────
            const event = req.body;
            if (event.event !== "payment.captured") {
                // Acknowledge unhandled events without processing
                return res.status(200).json({ received: true });
            }

            const paymentEntity = event.payload?.payment?.entity;
            if (!paymentEntity) {
                return res.status(400).json({ error: "Malformed webhook payload" });
            }

            const razorpay_order_id: string = paymentEntity.order_id;
            const razorpay_payment_id: string = paymentEntity.id;

            if (!razorpay_order_id || !razorpay_payment_id) {
                return res.status(400).json({ error: "Missing order_id or payment_id in payload" });
            }

            // ── 3. Idempotency guard ───────────────────────────────────────────────────
            const orderRef = db.collection("upi_payment_orders").doc(razorpay_order_id);
            const orderDoc = await orderRef.get();

            if (!orderDoc.exists) {
                // Not a Turbo UPI order managed by this app — ignore silently
                return res.status(200).json({ received: true });
            }

            const order = orderDoc.data()!;
            if (order.status !== "pending") {
                // Already handled (either by confirmUPIPaymentAndAwardPoints or a previous webhook)
                return res.status(200).json({ received: true, skipped: "already_processed" });
            }

            // ── 4. Fetch seller ────────────────────────────────────────────────────────
            const sellerDoc = await db.collection("seller_profiles").doc(order.seller_id).get();
            if (!sellerDoc.exists) {
                console.error(`razorpayWebhook: seller ${order.seller_id} not found for order ${razorpay_order_id}`);
                return res.status(200).json({ received: true, skipped: "seller_not_found" });
            }
            const seller = sellerDoc.data()!;
            const sellerName: string = seller.business?.shop_name || "";

            // ── 5. Calculate points ────────────────────────────────────────────────────
            const amountINR = order.amount / 100;
            const pointsEarned = calculateRewardPoints(amountINR, seller);

            // ── 6. Atomic batch write ──────────────────────────────────────────────────
            const batch = db.batch();
            const now = adminRef.firestore.FieldValue.serverTimestamp();

            // 6a. Mark order completed
            batch.update(orderRef, {
                status: "completed",
                razorpay_payment_id,
                completed_at: now,
                completed_via: "webhook",
            });

            // 6b. Create transaction record
            const txRef = db.collection("transactions").doc();
            batch.set(txRef, {
                user_id: order.user_id,
                seller_id: order.seller_id,
                seller_name: sellerName,
                type: "upi_payment",
                amount: order.amount,
                points_earned: pointsEarned,
                razorpay_order_id,
                razorpay_payment_id,
                created_at: now,
            });

            // 6c. Increment user loyalty points
            const customerRef = db.collection("customer_profiles").doc(order.user_id);
            batch.update(customerRef, {
                "stats.loyalty_points": adminRef.firestore.FieldValue.increment(pointsEarned),
                "stats.updated_at": now,
            });

            // 6d. Update seller stats
            const sellerRef = db.collection("seller_profiles").doc(order.seller_id);
            batch.update(sellerRef, {
                "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
                "stats.total_points_distributed": adminRef.firestore.FieldValue.increment(pointsEarned),
            });

            await batch.commit();

            return res.status(200).json({ received: true, points_awarded: pointsEarned });
        } catch (error: any) {
            console.error("razorpayWebhook error:", error);
            // Always 200 to Razorpay to prevent retries on server errors
            return res.status(200).json({ received: true, error: "Internal processing error" });
        }
    });
};
