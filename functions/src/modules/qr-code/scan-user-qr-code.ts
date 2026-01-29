import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import pushService, { NotificationChannel, NotificationType } from "../../services/expo-service";

const corsHandler = cors({ origin: true });

/** ----------------------------------------------------
 * UPDATE SELLER STATS with monthly breakdown
 * ---------------------------------------------------- */
async function updateSellerStats(sellerId: string, pointsEarned: number, isNewCustomer: boolean = false) {
    const sellerRef = db.collection("seller_profiles").doc(sellerId);

    // Get current date for monthly stats
    const now = new Date();
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const currentMonthKey = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();
    const monthlyScanKey = `stats.monthly_scans.${currentYear}.${currentMonthKey}`;

    // First, get the current document to update monthly scans properly
    const sellerDoc = await sellerRef.get();
    const sellerData = sellerDoc.data();

    const updateData: any = {
        "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
        "stats.total_points_distributed": adminRef.firestore.FieldValue.increment(pointsEarned)
    };

    // Update monthly scans - increment existing or set to 1 if doesn't exist
    const currentMonthlyScans = sellerData?.stats?.monthly_scans || {};
    const currentYearScans = currentMonthlyScans[currentYear] || {};
    const currentMonthCount = currentYearScans[currentMonthKey] || 0;

    updateData[monthlyScanKey] = currentMonthCount + 1;

    // Only increment active_customers if this is a new customer
    if (isNewCustomer) {
        updateData["stats.active_customers"] = adminRef.firestore.FieldValue.increment(1);
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
        // 1️⃣ Percentage-based reward
        case "percentage":
            if (!config.percentage_value) return 0;
            return Math.round((config.percentage_value / 100) * amount);

        // 2️⃣ Flat fixed points
        case "flat":
            return config.flat_points || 0;

        // 3️⃣ Slab-based rewards
        case "slab":
            if (!Array.isArray(config.slab_rules)) return 0;

            for (const rule of config.slab_rules) {
                if (amount >= rule.min && amount <= rule.max) {
                    return rule.points;
                }
            }

            // amount > last slab
            const last = config.slab_rules[config.slab_rules.length - 1];
            if (amount > last.max) return last.points;

            return 0;

        // 4️⃣ Default points (QR points)
        case "default":
        default:
            return config.default_points_value || 1;
    }
}
export const scanUserQRCode = functions.https.onRequest(
    { region: "asia-south1" },
    async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            try {
                // ----------------------------------
                // AUTH: Seller
                // ----------------------------------
                const sellerUser = await authenticateUser(req.headers.authorization);

                const {
                    user_id,
                    amount = 0,
                } = req.body;

                if (!user_id) {
                    return res.status(400).json({ error: "Invalid user QR" });
                }

                // ----------------------------------
                // Fetch Seller Profile
                // ----------------------------------
                const sellerProfileSnap = await db
                    .collection("seller_profiles")
                    .where("user_id", "==", sellerUser.uid)
                    .limit(1)
                    .get();

                if (sellerProfileSnap.empty) {
                    return res.status(404).json({ error: "Seller profile not found" });
                }

                const sellerDoc = sellerProfileSnap.docs[0];
                const sellerId = sellerDoc.id;
                const seller = sellerDoc.data();

                // ----------------------------------
                // Prevent duplicate daily scan
                // ----------------------------------
                const today = new Date();
                // today.setHours(0, 0, 0, 0);

                // const dailyScanQuery = await db
                //     .collection("daily_scans")
                //     .where("seller_id", "==", sellerId)
                //     .where("user_id", "==", user_id)
                //     .where("scan_date", "==", today)
                //     .limit(1)
                //     .get();

                // if (!dailyScanQuery.empty) {
                //     return res.status(400).json({
                //         error: "User already rewarded today",
                //     });
                // }

                // ----------------------------------
                // Calculate Reward
                // ----------------------------------
                const pointsEarned = calculateRewardPoints(amount, seller);

                // ----------------------------------
                // Check New Customer
                // ----------------------------------
                const newCustomer = await isNewCustomer(user_id, sellerId);

                // ----------------------------------
                // Update / Create Points
                // ----------------------------------
                const pointsRef = db.collection("points");
                const pointsSnap = await pointsRef
                    .where("user_id", "==", user_id)
                    .where("seller_id", "==", sellerId)
                    .limit(1)
                    .get();

                let totalPoints = pointsEarned;

                if (!pointsSnap.empty) {
                    const ref = pointsSnap.docs[0].ref;
                    const existing = pointsSnap.docs[0].data().points || 0;
                    totalPoints = existing + pointsEarned;

                    await ref.update({
                        points: totalPoints,
                        last_updated: new Date(),
                    });
                } else {
                    await pointsRef.add({
                        user_id,
                        seller_id: sellerId,
                        points: pointsEarned,
                        created_at: new Date(),
                        last_updated: new Date(),
                    });
                }

                // ----------------------------------
                // Update Customer Profile (NEW)
                // ----------------------------------
                const customerRef = db.collection("customer_profiles").doc(user_id);

                await customerRef.update(
                    {
                        "stats.loyalty_points": adminRef.firestore.FieldValue.increment(pointsEarned),
                        "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
                        "stats.updated_at": adminRef.firestore.FieldValue.serverTimestamp(),
                        "stats.visited_sellers": adminRef.firestore.FieldValue.arrayUnion(sellerId),
                    }
                );

                let customerName = "Customer";

                const customerSnap = await customerRef
                    .get();

                if (customerSnap.exists) {
                    const customerData = customerSnap.data();
                    customerName =
                        customerData?.account?.name
                }

                // ----------------------------------
                // Save Scan
                // ----------------------------------
                await db.collection("daily_scans").add({
                    user_id,
                    seller_id: sellerId,
                    scan_date: today,
                    scanned_at: new Date(),
                });

                // ----------------------------------
                // Transaction
                // ----------------------------------
                await db.collection("transactions").add({
                    user_id,
                    seller_id: sellerId,
                    seller_name: seller?.business?.shop_name,
                    points: pointsEarned,
                    transaction_type: "earn",
                    qr_type: "user",
                    amount,
                    timestamp: new Date(),
                    description: `Earned ${pointsEarned} points`,
                });

                // ----------------------------------
                // Update Seller Stats
                // ----------------------------------
                await updateSellerStats(sellerId, pointsEarned, newCustomer);
                const tokenSnap = await db
                    .collection("push_tokens")
                    .where("user_id", "==", user_id)
                    .get();

                const userTokens = tokenSnap.docs.map((d) => d.data().token);

                if (userTokens.length > 0) {
                    await pushService.sendToUser(
                        userTokens,
                        "⭐ Points Credited!",
                        `You earned ${pointsEarned} points at ${seller?.business?.shop_name}`,
                        {
                            type: NotificationType.POINTS_EARNED,
                            screen: "/(drawer)/(tabs)/wallet",
                            params: {
                                sellerId,
                                points: pointsEarned,
                            },
                        },
                        NotificationChannel.ORDERS
                    ).catch((err) => console.error("Push failed:", err));
                }

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
                console.error("Scan User QR Error:", err);
                return res.status(500).json({ error: err.message });
            }
        });
    }
);
