import { Request, Response } from "express";
import { adminRef, db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser, handleAuthError } from "../../middleware/auth";
import { getCurrentMonthScanCount } from "../../utils/helper";
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

const corsHandler = cors({ origin: true });

/** ----------------------------------------------------
 * SECURE QR SCAN BY SELLER
 * ---------------------------------------------------- */
export const scanUserQRCodeHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);

                // ----------------------------------
                // AUTH: Seller
                // ----------------------------------
                const sellerUser = await authenticateUser(req.headers.authorization);

                const { token, amount = 0 } = req.body;
                if (!token) return sendError(res, ErrorCodes.INVALID_INPUT, "Invalid QR code", HttpStatus.BAD_REQUEST);

                if (amount < 0 || amount > 100000) {
                    return sendError(res, ErrorCodes.INVALID_INPUT, "Invalid amount", HttpStatus.BAD_REQUEST);
                }

                // ----------------------------------
                // RESOLVE QR TOKEN → USER
                // ----------------------------------
                const tokenSnap = await db.collection("qr_tokens").doc(token).get();
                if (!tokenSnap.exists) return sendError(res, ErrorCodes.INVALID_INPUT, "Invalid or expired QR", HttpStatus.BAD_REQUEST);

                const tokenData = tokenSnap.data();
                if (tokenData?.status !== "active") return sendError(res, ErrorCodes.INVALID_INPUT, "QR no longer valid", HttpStatus.BAD_REQUEST);

                const user_id = tokenData.user_id;

                const lastUsed = tokenData.last_used_at?.toDate?.();

                if (lastUsed && Date.now() - lastUsed.getTime() < 10_000) {
                    return sendError(res, ErrorCodes.RATE_LIMIT_EXCEEDED, "QR scanned too quickly. Please wait a moment.", HttpStatus.TOO_MANY_REQUESTS);
                }

                // ----------------------------------
                // Fetch Seller Profile
                // ----------------------------------
                const sellerProfileSnap = await db.collection("seller_profiles")
                    .where("user_id", "==", sellerUser.uid)
                    .limit(1).get();

                if (sellerProfileSnap.empty) return sendError(res, ErrorCodes.NOT_FOUND, "Seller profile not found", HttpStatus.NOT_FOUND);


                const sellerDoc = sellerProfileSnap.docs[0];
                const sellerId = sellerDoc.id;
                const seller = sellerDoc.data();


                // ----------------------------------
                // 🔐 SUBSCRIPTION VALIDATION
                // ----------------------------------
                const subscription = seller.subscription;

                if (!subscription) {
                    return sendError(res, ErrorCodes.FORBIDDEN, "Subscription not found", HttpStatus.FORBIDDEN);
                }

                // 1️⃣ Subscription status
                if (subscription.status !== "active") {
                    return sendError(res, ErrorCodes.FORBIDDEN, "Subscription is inactive", HttpStatus.FORBIDDEN);
                }

                // 2️⃣ Subscription expiry
                const expiresAt = subscription.expires_at?.toDate?.();
                if (!expiresAt || expiresAt.getTime() < Date.now()) {
                    return sendError(res, ErrorCodes.FORBIDDEN, "Subscription expired", HttpStatus.FORBIDDEN);
                }

                // 3️⃣ Monthly scan limit
                const monthlyLimit = subscription.monthly_limit || 0;
                const currentMonthScans = getCurrentMonthScanCount(seller);

                if (currentMonthScans >= monthlyLimit) {
                    return sendError(res, ErrorCodes.RATE_LIMIT_EXCEEDED, "Monthly scan limit reached", HttpStatus.TOO_MANY_REQUESTS);
                }
                // OPTIONAL: anti-replay (update last_used_at)
                await tokenSnap.ref.update({ last_used_at: adminRef.firestore.FieldValue.serverTimestamp() });

                // ----------------------------------
                // Calculate Reward
                // ----------------------------------
                let pointsEarned = calculateRewardPoints(amount, seller);

                // ----------------------------------
                // Check New Customer + Calculate Reward
                // ----------------------------------
                const newCustomer = await isNewCustomer(user_id, sellerId);
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

                // ----------------------------------
                // Atomic transaction write (using shared utility)
                // ----------------------------------
                // Get customer name first (needed for transaction record)
                const customerRef = db.collection("customer_profiles").doc(user_id);
                const customerSnap = await customerRef.get();
                const customerName = customerSnap.exists ? customerSnap.data()?.account?.name || "Customer" : "Customer";

                await createPointsEarningTransaction({
                    userId: user_id,
                    sellerId,
                    sellerName: seller?.business?.shop_name,
                    pointsEarned,
                    basePoints: calculateRewardPoints(amount, seller),
                    bonusPoints: isFirstScanBonus ? Math.round(seller.rewards.first_scan_bonus.points) : 0,
                    transactionType: "qr_scan",
                    amount,
                    description: isFirstScanBonus
                        ? `Earned ${pointsEarned} points (including first scan bonus)`
                        : `Earned ${pointsEarned} points`,
                    customerName,
                });

                // Parallel: update points, daily scan, seller stats, and notifications
                const totalPoints = await updatePointsCollection(user_id, sellerId, pointsEarned);
                await Promise.all([
                    createDailyScanRecord(user_id, sellerId, "qr_scan"),
                    updateSellerStats(sellerId, pointsEarned, newCustomer, isFirstScanBonus),
                    sendPointsEarnedNotifications(user_id, sellerId, pointsEarned, seller?.business?.shop_name, customerName),
                    activateUserIfFirstTime(user_id, sellerId),
                ]);

                return sendSuccess(res, {
                    points_earned: pointsEarned,
                    total_points: totalPoints,
                    seller_name: seller?.business?.shop_name,
                    customer_name: customerName,
                }, HttpStatus.OK);
            } catch (err: any) {
                if (err.name === "AuthError") return handleAuthError(err, res);
                console.error("Scan User QR Error:", err);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, err.message || "Internal server error", err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};