import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const sellerStats = functions
    .https.onRequest({ region: "asia-south1", minInstances: 1, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "GET") {
                    return res.status(405).json({ error: "Only GET allowed" });
                }

                // Authenticate user
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                // Get seller profile
                const profileSnap = await db
                    .collection("seller_profiles")
                    .where("user_id", "==", currentUser.uid)
                    .limit(1)
                    .get();

                if (profileSnap.empty) {
                    return res.status(404).json({ error: "Seller profile not found" });
                }

                const profileDoc = profileSnap.docs[0];
                const sellerId = profileDoc.id;
                const sellerData = profileDoc.data();

                const results: any = {
                    seller_id: sellerId,
                    seller_name: sellerData?.business.shop_name ?? null,
                    total_users: 0,
                    active_qr_codes: 0,
                    total_qrs: 0,
                    total_scanned: 0,
                    total_points_issued: 0,
                    total_redemptions: 0,
                    total_points_redeemed: 0,
                    pending_redemptions: 0,
                    redemption_rate: 0,
                    redeemed_customers: 0,
                    last_five_scans: [],
                    last_five_redemptions: [],
                    today: { scans: 0, points_issued: 0, redemptions: 0, points_redeemed: 0 },
                    subscription_tier: sellerData?.subscription?.tier || "free",
                    locked_features: sellerData?.subscription?.tier === "free",
                };

                // Run independent queries in parallel
                const [
                    qrActiveSnap,
                    qrTotalCountSnap,
                    txSnap,
                    redemptionsSnap,
                    redeemedSnap,
                    lastFiveScansSnap,
                    lastFiveRedemptionsSnap,
                    todayScansSnap,
                    todayRedemptionsSnap,
                ] = await Promise.all([
                    // Active QR codes
                    db.collection("qr_codes")
                        .where("seller_id", "==", sellerId)
                        .where("status", "==", "active")
                        .get(),
                    // Total QR codes count
                    db.collection("qr_codes")
                        .where("seller_id", "==", sellerId)
                        .count()
                        .get(),
                    // All transactions of type "earn"
                    db.collection("transactions")
                        .where("seller_id", "==", sellerId)
                        .where("transaction_type", "==", "earn")
                        .get(),
                    // All redemptions
                    db.collection("redemptions")
                        .where("seller_id", "==", sellerId)
                        .get(),
                    // All redeemed redemptions
                    db.collection("redemptions")
                        .where("seller_id", "==", sellerId)
                        .where("status", "==", "redeemed")
                        .get(),
                    // Last 5 scans
                    db.collection("transactions")
                        .where("seller_id", "==", sellerId)
                        .where("transaction_type", "==", "earn")
                        .orderBy("timestamp", "desc")
                        .limit(5)
                        .get(),
                    // Last 5 redemptions
                    db.collection("redemptions")
                        .where("seller_id", "==", sellerId)
                        .orderBy("created_at", "desc")
                        .limit(5)
                        .get(),
                    // Today’s scans
                    (() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return db.collection("transactions")
                            .where("seller_id", "==", sellerId)
                            .where("transaction_type", "==", "earn")
                            .where("timestamp", ">=", today)
                            .get();
                    })(),
                    // Today’s redemptions
                    (() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return db.collection("redemptions")
                            .where("seller_id", "==", sellerId)
                            .where("status", "==", "redeemed")
                            .where("redeemed_at", ">=", today)
                            .get();
                    })(),
                ]);

                // QR codes stats
                results.active_qr_codes = qrActiveSnap.size;
                results.total_qrs = qrTotalCountSnap.data()?.count || 0;

                // Transactions stats
                let pointsSum = 0;
                const userSet = new Set<string>();
                txSnap.forEach(doc => {
                    const d = doc.data();
                    pointsSum += Number(d.points || 0);
                    if (d.user_id) userSet.add(d.user_id);
                });
                results.total_points_issued = pointsSum;
                results.total_scanned = txSnap.size;
                results.total_users = userSet.size;

                // Redemptions stats
                let totalRedemptions = 0;
                let pendingRedemptions = 0;
                let totalPointsRedeemed = 0;
                const redeemedCustomersSet = new Set<string>();

                redemptionsSnap.forEach(doc => {
                    const r = doc.data();
                    if (r.status === "redeemed") {
                        totalRedemptions++;
                        totalPointsRedeemed += Number(r.points || 0);
                    } else if (r.status === "pending") {
                        pendingRedemptions++;
                    }
                });

                redeemedSnap.forEach(doc => {
                    const r = doc.data();
                    if (r.user_id) redeemedCustomersSet.add(r.user_id);
                });

                results.total_redemptions = totalRedemptions;
                results.pending_redemptions = pendingRedemptions;
                results.total_points_redeemed = totalPointsRedeemed;
                results.redeemed_customers = redeemedCustomersSet.size;
                results.redemption_rate = results.total_users
                    ? Math.round((redeemedCustomersSet.size / results.total_users) * 100)
                    : 0;

                // Last 5 scans
                results.last_five_scans = lastFiveScansSnap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp,
                }));

                // Last 5 redemptions
                results.last_five_redemptions = lastFiveRedemptionsSnap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    created_at: doc.data().created_at?.toDate?.() || doc.data().created_at,
                    redeemed_at: doc.data().redeemed_at?.toDate?.() || doc.data().redeemed_at,
                }));

                // Today stats
                let todayPoints = 0;
                todayScansSnap.forEach(doc => {
                    todayPoints += Number(doc.data().points || 0);
                });
                let todayRedeemedPoints = 0;
                todayRedemptionsSnap.forEach(doc => {
                    todayRedeemedPoints += Number(doc.data().points || 0);
                });
                results.today = {
                    scans: todayScansSnap.size,
                    points_issued: todayPoints,
                    redemptions: todayRedemptionsSnap.size,
                    points_redeemed: todayRedeemedPoints,
                };

                return res.status(200).json({ success: true, data: results });
            } catch (error: any) {
                console.error("sellerStats error:", error);
                return res.status(error.statusCode ?? 500).json({ error: error.message || "Server error" });
            }
        });
    });
