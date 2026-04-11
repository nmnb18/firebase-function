import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
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

export const confirmUPIPaymentAndAwardPointsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
            }

            const {
                razorpay_payment_id,
                razorpay_order_id,
                razorpay_signature,
                seller_id,
            } = req.body;

            if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !seller_id) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Missing required fields", HttpStatus.BAD_REQUEST);
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
                return sendError(res, ErrorCodes.INVALID_PAYMENT_SIGNATURE, "Invalid payment signature", HttpStatus.BAD_REQUEST);
            }

            // ── 2. Fetch order — idempotency guard ─────────────────────────────────────
            const orderRef = db.collection("upi_payment_orders").doc(razorpay_order_id);
            const orderDoc = await orderRef.get();

            if (!orderDoc.exists) {
                return sendError(res, ErrorCodes.NOT_FOUND, "Order not found", HttpStatus.NOT_FOUND);
            }

            const order = orderDoc.data()!;

            if (order.status !== "pending") {
                return sendError(res, ErrorCodes.ORDER_ALREADY_PROCESSED, "Order already processed", HttpStatus.CONFLICT);
            }

            // Confirm the order belongs to the authenticated user
            if (order.user_id !== currentUser.uid) {
                return sendError(res, ErrorCodes.FORBIDDEN, "Forbidden", HttpStatus.FORBIDDEN);
            }

            // ── 3. Fetch seller ────────────────────────────────────────────────────────
            const sellerDoc = await db.collection("seller_profiles").doc(seller_id).get();
            if (!sellerDoc.exists) {
                return sendError(res, ErrorCodes.NOT_FOUND, "Seller not found", HttpStatus.NOT_FOUND);
            }
            const seller = sellerDoc.data()!;
            const sellerName: string = seller.business?.shop_name || "";

            // ── 4. Points snap — check new customer + first-time bonus ────────────────
            const amountINR = order.amount / 100;
            let pointsEarned = calculateRewardPoints(amountINR, seller);

            const newCustomer = await isNewCustomer(currentUser.uid, seller_id);
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

            // ── 5. Atomic batch write (using shared utility) ──────────────────────────
            await createPointsEarningTransaction({
                userId: currentUser.uid,
                sellerId: seller_id,
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
                completedVia: "user_app",
            });

            const customerRef = db.collection("customer_profiles").doc(currentUser.uid);

            // ── 6. Post-transaction operations (points, daily_scans, stats, notifications) ─────
            const updatedCustomer = await customerRef.get();
            const totalPoints: number = updatedCustomer.data()?.stats?.loyalty_points || 0;
            const customerName: string = updatedCustomer.data()?.account?.name || "Customer";

            await Promise.all([
                updatePointsCollection(currentUser.uid, seller_id, pointsEarned),
                createDailyScanRecord(currentUser.uid, seller_id, "upi_payment"),
                updateSellerStats(seller_id, pointsEarned, newCustomer, isFirstScanBonus),
                sendPointsEarnedNotifications(currentUser.uid, seller_id, pointsEarned, sellerName, customerName),
                activateUserIfFirstTime(currentUser.uid, seller_id),
            ]);

            return sendSuccess(res, {
                points_earned: pointsEarned,
                total_points: totalPoints,
                seller_name: sellerName,
                payment_id: razorpay_payment_id,
            }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
