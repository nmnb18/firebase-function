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

const corsHandler = cors({ origin: true });

/** ----------------------------------------------------
 * SECURE QR SCAN BY SELLER
 * ---------------------------------------------------- */
export const scanUserQRCodeHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

                // ----------------------------------
                // AUTH: Seller
                // ----------------------------------
                const sellerUser = await authenticateUser(req.headers.authorization);
                // if (sellerUser.role !== "seller") {
                //     return res.status(403).json({ error: "Unauthorized" });
                // }

                const { token, amount = 0 } = req.body;
                if (!token) return res.status(400).json({ error: "Invalid QR code" });

                if (amount < 0 || amount > 100000) {
                    return res.status(400).json({ error: "Invalid amount" });
                }

                // ----------------------------------
                // RESOLVE QR TOKEN → USER
                // ----------------------------------
                const tokenSnap = await db.collection("qr_tokens").doc(token).get();
                if (!tokenSnap.exists) return res.status(400).json({ error: "Invalid or expired QR" });

                const tokenData = tokenSnap.data();
                if (tokenData?.status !== "active") return res.status(400).json({ error: "QR no longer valid" });

                const user_id = tokenData.user_id;

                const lastUsed = tokenData.last_used_at?.toDate?.();

                if (lastUsed && Date.now() - lastUsed.getTime() < 10_000) {
                    return res.status(429).json({
                        error: "QR scanned too quickly. Please wait a moment.",
                    });
                }

                // ----------------------------------
                // Fetch Seller Profile
                // ----------------------------------
                const sellerProfileSnap = await db.collection("seller_profiles")
                    .where("user_id", "==", sellerUser.uid)
                    .limit(1).get();

                if (sellerProfileSnap.empty) return res.status(404).json({ error: "Seller profile not found" });


                const sellerDoc = sellerProfileSnap.docs[0];
                const sellerId = sellerDoc.id;
                const seller = sellerDoc.data();


                // ----------------------------------
                // 🔐 SUBSCRIPTION VALIDATION
                // ----------------------------------
                const subscription = seller.subscription;

                if (!subscription) {
                    return res.status(403).json({
                        error: "Subscription not found",
                        code: "NO_SUBSCRIPTION"
                    });
                }

                // 1️⃣ Subscription status
                if (subscription.status !== "active") {
                    return res.status(403).json({
                        error: "Subscription is inactive",
                        code: "SUBSCRIPTION_INACTIVE"
                    });
                }

                // 2️⃣ Subscription expiry
                const expiresAt = subscription.expires_at?.toDate?.();
                if (!expiresAt || expiresAt.getTime() < Date.now()) {
                    return res.status(403).json({
                        error: "Subscription expired",
                        code: "SUBSCRIPTION_EXPIRED"
                    });
                }

                // 3️⃣ Monthly scan limit
                const monthlyLimit = subscription.monthly_limit || 0;
                const currentMonthScans = getCurrentMonthScanCount(seller);

                if (currentMonthScans >= monthlyLimit) {
                    return res.status(429).json({
                        error: "Monthly scan limit reached",
                        code: "MONTHLY_LIMIT_REACHED",
                        data: {
                            limit: monthlyLimit,
                            used: currentMonthScans
                        }
                    });
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

                return res.status(200).json({
                    success: true,
                    data: {
                        points_earned: pointsEarned,
                        total_points: totalPoints,
                        seller_name: seller?.business?.shop_name,
                        customer_name: customerName,
                    },
                });
            } catch (err: any) {
                if (err.name === "AuthError") return handleAuthError(err, res);
                console.error("Scan User QR Error:", err);
                return res.status(err.statusCode ?? 500).json({ error: err.message || "Internal server error" });
            }
        });
};