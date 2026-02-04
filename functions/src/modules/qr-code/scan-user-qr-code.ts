import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser, handleAuthError } from "../../middleware/auth";
import pushService, { NotificationChannel, NotificationType } from "../../services/expo-service";
import { getCurrentMonthScanCount, saveNotification } from "../../utils/helper";

const corsHandler = cors({ origin: true });


/** ----------------------------------------------------
 * UPDATE SELLER STATS with monthly breakdown
 * ---------------------------------------------------- */

async function activateUserIfFirstTime(
    userId: string,
    sellerId: string
) {
    const userRef = db.collection("customer_profiles").doc(userId);
    const sellerRef = db.collection("seller_profiles").doc(sellerId);

    await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);

        if (!userSnap.exists) return;

        const activation = userSnap.data()?.activation;

        // Already activated → do nothing
        if (activation?.activated_by) return;

        // 1️⃣ Mark user activated
        tx.update(userRef, {
            "activation.activated_by": sellerId,
            "activation.activated_at": adminRef.firestore.FieldValue.serverTimestamp(),
        });

        // 2️⃣ Increment seller activation count
        tx.update(sellerRef, {
            "stats.users_activated": adminRef.firestore.FieldValue.increment(1),
        });
    });
}

async function updateSellerStats(sellerId: string, pointsEarned: number, isNewCustomer: boolean = false) {
    const sellerRef = db.collection("seller_profiles").doc(sellerId);

    const now = new Date();
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const currentMonthKey = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();
    const monthlyScanKey = `stats.monthly_scans.${currentYear}.${currentMonthKey}`;

    const sellerDoc = await sellerRef.get();
    const sellerData = sellerDoc.data();

    const updateData: any = {
        "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
        "stats.total_points_distributed": adminRef.firestore.FieldValue.increment(pointsEarned)
    };

    const currentMonthlyScans = sellerData?.stats?.monthly_scans || {};
    const currentYearScans = currentMonthlyScans[currentYear] || {};
    const currentMonthCount = currentYearScans[currentMonthKey] || 0;
    updateData[monthlyScanKey] = currentMonthCount + 1;

    if (isNewCustomer) {
        updateData["stats.active_customers"] = adminRef.firestore.FieldValue.increment(1);
        if (sellerData?.rewards?.first_scan_bonus?.enabled) {
            updateData["stats.first_scan_bonus_given"] = adminRef.firestore.FieldValue.increment(1);
        }
    }

    await sellerRef.update(updateData);
}

/** ----------------------------------------------------
 * CHECK IF USER IS NEW CUSTOMER FOR THIS SELLER
 * ---------------------------------------------------- */
async function isNewCustomer(userId: string, sellerId: string): Promise<boolean> {
    const pointsQuery = await db.collection("points")
        .where("user_id", "==", userId)
        .where("seller_id", "==", sellerId)
        .limit(1)
        .get();
    return pointsQuery.empty;
}

/** ----------------------------------------------------
 * UNIVERSAL REWARD CALCULATOR
 * Supports: flat | percentage | slab | default
 * ---------------------------------------------------- */
function calculateRewardPoints(amount: number, seller: any): number {
    const config = seller.rewards || {};
    switch (config.reward_type) {
        case "percentage":
            if (!config.percentage_value) return 0;
            return Math.round((config.percentage_value / 100) * amount);
        case "flat":
            return config.flat_points || 0;
        case "slab":
            if (!Array.isArray(config.slab_rules)) return 0;
            for (const rule of config.slab_rules) {
                if (amount >= rule.min && amount <= rule.max) return rule.points;
            }
            const last = config.slab_rules[config.slab_rules.length - 1];
            if (amount > last.max) return last.points;
            return 0;
        case "default":
        default:
            return config.default_points_value || 1;
    }
}

/** ----------------------------------------------------
 * SECURE QR SCAN BY SELLER
 * ---------------------------------------------------- */
export const scanUserQRCode = functions.https.onRequest(
    { region: "asia-south1" },
    async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

                // ----------------------------------
                // AUTH: Seller
                // ----------------------------------
                const sellerUser = await authenticateUser(req.headers.authorization);
                console.log('seller-user', sellerUser)
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
                // Check New Customer
                // ----------------------------------
                const newCustomer = await isNewCustomer(user_id, sellerId);
                let isFirstScanBonus = false;
                if (
                    newCustomer &&
                    seller?.rewards?.first_scan_bonus?.enabled &&
                    seller?.rewards?.first_scan_bonus?.points > 0
                ) {
                    pointsEarned += seller.rewards.first_scan_bonus.points;
                    isFirstScanBonus = true;
                }

                // ----------------------------------
                // Update / Create Points
                // ----------------------------------
                const pointsRef = db.collection("points");
                const pointsSnap = await pointsRef.where("user_id", "==", user_id).where("seller_id", "==", sellerId).limit(1).get();
                let totalPoints = pointsEarned;

                if (!pointsSnap.empty) {
                    const ref = pointsSnap.docs[0].ref;
                    const existing = pointsSnap.docs[0].data().points || 0;
                    totalPoints = existing + pointsEarned;
                    await ref.update({ points: totalPoints, last_updated: new Date() });
                } else {
                    await pointsRef.add({ user_id, seller_id: sellerId, points: pointsEarned, created_at: new Date(), last_updated: new Date() });
                }

                // ----------------------------------
                // Update Customer Profile
                // ----------------------------------
                const customerRef = db.collection("customer_profiles").doc(user_id);
                await customerRef.update({
                    "stats.loyalty_points": adminRef.firestore.FieldValue.increment(pointsEarned),
                    "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
                    "stats.updated_at": adminRef.firestore.FieldValue.serverTimestamp(),
                    "stats.visited_sellers": adminRef.firestore.FieldValue.arrayUnion(sellerId),
                });

                let customerName = "Customer";
                const customerSnap = await customerRef.get();
                if (customerSnap.exists) customerName = customerSnap.data()?.account?.name || "Customer";

                // ----------------------------------
                // Save Daily Scan
                // ----------------------------------
                await db.collection("daily_scans").add({ user_id, seller_id: sellerId, scan_date: new Date(), scanned_at: new Date() });

                // ----------------------------------
                // Record Transaction
                // ----------------------------------
                await db.collection("transactions").add({
                    user_id,
                    seller_id: sellerId,
                    seller_name: seller?.business?.shop_name,
                    customer_name: customerName,
                    points: pointsEarned,
                    base_points: calculateRewardPoints(amount, seller),
                    bonus_points: newCustomer
                        ? seller?.rewards?.first_scan_bonus?.points || 0
                        : 0,
                    transaction_type: "earn",
                    qr_type: "user",
                    amount,
                    timestamp: new Date(),
                    description: isFirstScanBonus
                        ? `Earned ${pointsEarned} points (including first scan bonus)`
                        : `Earned ${pointsEarned} points`,
                });

                // ----------------------------------
                // Update Seller Stats
                // ----------------------------------
                await updateSellerStats(sellerId, pointsEarned, newCustomer);

                // ----------------------------------
                // Send Push Notification
                // ----------------------------------
                await saveNotification(
                    user_id,
                    "⭐ Points Credited!",
                    `You earned ${pointsEarned} points at ${seller?.business?.shop_name}`,
                    {
                        type: NotificationType.POINTS_EARNED,
                        screen: "/(drawer)/(tabs)/wallet",
                        sellerId,
                        points: pointsEarned,
                    }
                );
                const tokenSnapPush = await db.collection("push_tokens").where("user_id", "==", user_id).get();
                const userTokens = tokenSnapPush.docs.map(d => d.data().token);

                if (userTokens.length > 0) {
                    await pushService.sendToUser(
                        userTokens,
                        "⭐ Points Credited!",
                        `You earned ${pointsEarned} points at ${seller?.business?.shop_name}`,
                        {
                            type: NotificationType.POINTS_EARNED,
                            screen: "/(drawer)/(tabs)/wallet",
                            params: { sellerId, points: pointsEarned },
                        },
                        NotificationChannel.ORDERS
                    ).catch(err => console.error("Push failed:", err));
                }

                await saveNotification(
                    user_id,
                    "⭐ Points Credited!",
                    `Customer ${customerName} earned ${pointsEarned} points at your store.`,
                    {
                        type: NotificationType.POINTS_EARNED,
                        screen: "/(drawer)/(tabs)/wallet",
                        sellerId,
                        points: pointsEarned,
                    }
                );
                const tokenSnapPush1 = await db.collection("push_tokens").where("user_id", "==", sellerId).get();
                const sellerTokens = tokenSnapPush1.docs.map(d => d.data().token);

                if (sellerTokens.length > 0) {
                    await pushService.sendToUser(
                        sellerTokens,
                        "⭐ Points Credited!",
                        `Customer ${customerName} earned ${pointsEarned} points at your store.`,
                        {
                            type: NotificationType.NEW_ORDER,
                            screen: "/(drawer)/redemptions",
                        },
                        NotificationChannel.ORDERS
                    ).catch(err => console.error("Push failed:", err));
                }

                await activateUserIfFirstTime(user_id, sellerId);

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
                return res.status(500).json({ error: err.message || "Internal server error" });
            }
        });
    }
);
