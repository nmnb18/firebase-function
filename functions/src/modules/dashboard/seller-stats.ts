import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

/**
 * Seller dashboard stats
 * - requires Authorization Bearer token (authenticateUser) which should set req.currentUser
 * - returns:
 *   {
 *     total_users: number,        // distinct users who scanned this seller (based on scans collection)
 *     active_qr_codes: number,    // qr_codes where seller_id == sellerId and active == true
 *     total_scanned: number,      // total scans for this seller
 *     total_points_issued: number,// sum of points awarded for scans for this seller
 *     total_redemptions: number,  // count of redemptions for this seller (if you use 'redemptions' collection)
 *     seller_id: string,
 *     seller_name?: string
 *   }
 */
// Update the sellerStats function to include redemption stats

export const sellerStats = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Only GET allowed" });
            }

            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser || !currentUser.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            // Get seller profile
            const profilesRef = db.collection('seller_profiles');
            const profileQuery = await profilesRef
                .where('user_id', '==', currentUser.uid)
                .limit(1)
                .get();

            if (profileQuery.empty) {
                return res.status(404).json({ error: "Seller profile not found" });
            }

            const profileDoc = profileQuery.docs[0];
            const sellerId = profileDoc.id;
            const sellerData = profileDoc.data();

            const results: any = {
                total_users: 0,
                active_qr_codes: 0,
                total_scanned: 0,
                total_points_issued: 0,
                total_redemptions: 0,
                total_points_redeemed: 0,  // NEW: Total points redeemed
                pending_redemptions: 0,    // NEW: Pending redemptions count
                redemption_rate: 0,        // NEW: Redemption percentage
                seller_id: sellerId,
                seller_name: undefined
            };

            results.seller_name = sellerData?.business.shop_name ?? null;

            // 1) Active QR Codes
            const qrQ = await db.collection("qr_codes")
                .where("seller_id", "==", sellerId)
                .where("status", "==", "active")
                .get();
            results.active_qr_codes = qrQ.size;
            results.total_qrs = await db.collection("qr_codes")
                .where("seller_id", "==", sellerId)
                .count()
                .get()
                .then(snap => snap.data().count);

            // 2) Transactions (earn) for total scans and points issued
            const txQ = await db.collection("transactions")
                .where("seller_id", "==", sellerId)
                .where("transaction_type", "==", "earn")
                .get();

            results.total_scanned = txQ.size;

            let pointsSum = 0;
            const userSet = new Set<string>();

            txQ.forEach((doc) => {
                const d = doc.data();
                if (d?.points) pointsSum += Number(d.points) || 0;
                if (d?.user_id) userSet.add(d.user_id);
            });

            results.total_points_issued = pointsSum;
            results.total_users = userSet.size;

            // 3) Redemptions - NEW LOGIC
            const redemptionsQuery = await db.collection("redemptions")
                .where("seller_id", "==", sellerId)
                .get();

            let totalRedemptions = 0;
            let pendingRedemptions = 0;
            let totalPointsRedeemed = 0;

            redemptionsQuery.forEach((doc) => {
                const redemption = doc.data();
                if (redemption.status === "redeemed") {
                    totalRedemptions++;
                    totalPointsRedeemed += Number(redemption.points || 0);
                } else if (redemption.status === "pending") {
                    pendingRedemptions++;
                }
            });

            results.total_redemptions = totalRedemptions;
            results.total_points_redeemed = totalPointsRedeemed;
            results.pending_redemptions = pendingRedemptions;

            // Calculate redemption rate (redeemed customers / earned customers)
            const redeemedCustomersSet = new Set<string>();
            const redeemedRedemptions = await db.collection("redemptions")
                .where("seller_id", "==", sellerId)
                .where("status", "==", "redeemed")
                .get();

            redeemedRedemptions.forEach(doc => {
                const redemption = doc.data();
                if (redemption.user_id) {
                    redeemedCustomersSet.add(redemption.user_id);
                }
            });

            results.redeemed_customers = redeemedCustomersSet.size;
            results.redemption_rate = results.total_users > 0
                ? Math.round((redeemedCustomersSet.size / results.total_users) * 100)
                : 0;

            // 4) LAST 5 SCANS
            const lastFiveQ = await db.collection("transactions")
                .where("seller_id", "==", sellerId)
                .where("transaction_type", "==", "earn")
                .orderBy("timestamp", "desc")
                .limit(5)
                .get();

            results.last_five_scans = lastFiveQ.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
            }));

            // 5) LAST 5 REDEMPTIONS - NEW
            const lastFiveRedemptions = await db.collection("redemptions")
                .where("seller_id", "==", sellerId)
                .orderBy("created_at", "desc")
                .limit(5)
                .get();

            results.last_five_redemptions = lastFiveRedemptions.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                created_at: doc.data().created_at?.toDate?.() || doc.data().created_at,
                redeemed_at: doc.data().redeemed_at?.toDate?.() || doc.data().redeemed_at
            }));

            // 6) TODAY'S STATS
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayScansQ = await db.collection("transactions")
                .where("seller_id", "==", sellerId)
                .where("transaction_type", "==", "earn")
                .where("timestamp", ">=", today)
                .get();

            let todayPoints = 0;
            let todayScans = todayScansQ.size;

            todayScansQ.forEach(doc => {
                const d = doc.data();
                todayPoints += Number(d.points || 0);
            });

            // TODAY'S REDEMPTIONS - NEW
            const todayRedemptionsQ = await db.collection("redemptions")
                .where("seller_id", "==", sellerId)
                .where("status", "==", "redeemed")
                .where("redeemed_at", ">=", today)
                .get();

            let todayRedeemedPoints = 0;
            todayRedemptionsQ.forEach(doc => {
                const redemption = doc.data();
                todayRedeemedPoints += Number(redemption.points || 0);
            });

            results.today = {
                scans: todayScans,
                points_issued: todayPoints,
                redemptions: todayRedemptionsQ.size,
                points_redeemed: todayRedeemedPoints
            };

            // 7) SUBSCRIPTION INFO
            results.subscription_tier = sellerData?.subscription?.tier || "free";
            results.locked_features = (results.subscription_tier === "free");

            return res.status(200).json({ success: true, data: results });
        } catch (error: any) {
            console.error("sellerStats error:", error);
            return res.status(500).json({ error: error.message || "Server error" });
        }
    });
});
