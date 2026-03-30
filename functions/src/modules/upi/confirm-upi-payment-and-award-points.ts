import { Request, Response } from "express";
import cors from "cors";
import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { calculateRewardPoints } from "../../utils/calculate-reward-points";

const corsHandler = cors({ origin: true });

/**
 * POST /confirmUPIPaymentAndAwardPoints
 *
 * Called by the user app after the Razorpay SDK completes payment.
 * Verifies the HMAC-SHA256 signature, then atomically:
 *   1. Marks the upi_payment_order as "completed"
 *   2. Creates a transaction record
 *   3. Increments customer loyalty points
 *   4. Updates seller stats
 *
 * Idempotent: returns 409 if the order is already processed.
 *
 * Body: { razorpay_payment_id, razorpay_order_id, razorpay_signature, seller_id }
 * Auth: Firebase JWT required (user token)
 */
export const confirmUPIPaymentAndAwardPointsHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "POST only" });
        }

        try {
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const {
                razorpay_payment_id,
                razorpay_order_id,
                razorpay_signature,
                seller_id,
            } = req.body;

            if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !seller_id) {
                return res.status(400).json({ error: "Missing required fields" });
            }

            // ── 1. Verify Razorpay payment signature ───────────────────────────────────
            const env = process.env.RAZORPAY_ENV || "test";
            const key_secret =
                env === "live"
                    ? process.env.RAZORPAY_SECRET_LIVE!
                    : process.env.RAZORPAY_SECRET_TEST!;

            const expectedSignature = crypto
                .createHmac("sha256", key_secret)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest("hex");

            if (expectedSignature !== razorpay_signature) {
                return res.status(400).json({ error: "Invalid payment signature" });
            }

            // ── 2. Fetch order — idempotency guard ─────────────────────────────────────
            const orderRef = db.collection("upi_payment_orders").doc(razorpay_order_id);
            const orderDoc = await orderRef.get();

            if (!orderDoc.exists) {
                return res.status(404).json({ error: "Order not found" });
            }

            const order = orderDoc.data()!;

            if (order.status !== "pending") {
                return res.status(409).json({
                    error: "Order already processed",
                    code: "ALREADY_PROCESSED",
                });
            }

            // Confirm the order belongs to the authenticated user
            if (order.user_id !== currentUser.uid) {
                return res.status(403).json({ error: "Forbidden" });
            }

            // ── 3. Fetch seller ────────────────────────────────────────────────────────
            const sellerDoc = await db.collection("seller_profiles").doc(seller_id).get();
            if (!sellerDoc.exists) {
                return res.status(404).json({ error: "Seller not found" });
            }
            const seller = sellerDoc.data()!;
            const sellerName: string = seller.business?.shop_name || "";

            // ── 4. Calculate points (amount is stored in paise → convert to INR) ──────
            const amountINR = order.amount / 100;
            const pointsEarned = calculateRewardPoints(amountINR, seller);

            // ── 5. Atomic batch write ──────────────────────────────────────────────────
            const batch = db.batch();
            const now = adminRef.firestore.FieldValue.serverTimestamp();

            // 5a. Mark order completed
            batch.update(orderRef, {
                status: "completed",
                razorpay_payment_id,
                completed_at: now,
            });

            // 5b. Create transaction record (mirrors existing QR-scan transaction schema)
            const txRef = db.collection("transactions").doc();
            batch.set(txRef, {
                user_id: currentUser.uid,
                seller_id,
                seller_name: sellerName,
                type: "upi_payment",
                amount: order.amount,
                points_earned: pointsEarned,
                razorpay_order_id,
                razorpay_payment_id,
                created_at: now,
            });

            // 5c. Increment user loyalty points
            const customerRef = db.collection("customer_profiles").doc(currentUser.uid);
            batch.update(customerRef, {
                "stats.loyalty_points": adminRef.firestore.FieldValue.increment(pointsEarned),
                "stats.updated_at": now,
            });

            // 5d. Update seller stats
            const sellerRef = db.collection("seller_profiles").doc(seller_id);
            batch.update(sellerRef, {
                "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
                "stats.total_points_distributed": adminRef.firestore.FieldValue.increment(pointsEarned),
            });

            await batch.commit();

            // Resolve total points for response
            const updatedCustomer = await customerRef.get();
            const totalPoints: number = updatedCustomer.data()?.stats?.loyalty_points || 0;

            return res.status(200).json({
                success: true,
                points_earned: pointsEarned,
                total_points: totalPoints,
                seller_name: sellerName,
                payment_id: razorpay_payment_id,
            });
        } catch (error: any) {
            console.error("confirmUPIPaymentAndAwardPoints error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    });
};
