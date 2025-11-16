import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const sellerAdvancedAnalytics = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Only GET allowed" });
            }

            // 1) AUTHENTICATE
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser || !currentUser.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            // 2) GET SELLER PROFILE
            const profilesRef = db.collection("seller_profiles");
            const profileQuery = await profilesRef
                .where("user_id", "==", currentUser.uid)
                .limit(1)
                .get();

            if (profileQuery.empty) {
                return res.status(404).json({ error: "Seller profile not found" });
            }

            const profileDoc = profileQuery.docs[0];
            const sellerId = profileDoc.id;
            const sellerData = profileDoc.data();
            const tier: "free" | "pro" | "premium" = sellerData.subscription.tier || "free";

            // 3) BLOCK FREE TIER
            if (tier === "free") {
                return res.status(403).json({
                    error: "Advanced analytics are available only on Pro or Premium plans.",
                });
            }

            // Time windows
            const now = new Date();
            const last30 = new Date();
            last30.setDate(now.getDate() - 30);
            last30.setHours(0, 0, 0, 0);

            const last7 = new Date();
            last7.setDate(now.getDate() - 7);
            last7.setHours(0, 0, 0, 0);

            // ----- A: BASE DATA QUERIES -----

            // 4) TRANSACTIONS (earn only) LAST 30 DAYS
            const txQ = await db
                .collection("transactions")
                .where("seller_id", "==", sellerId)
                .where("transaction_type", "==", "earn")
                .where("timestamp", ">=", last30)
                .get();

            // 5) REDEMPTIONS LAST 30 DAYS
            let redQ: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData> | null = null;
            try {
                redQ = await db
                    .collection("redemptions")
                    .where("seller_id", "==", sellerId)
                    .where("timestamp", ">=", last30)
                    .get();
            } catch (e) {
                redQ = null;
            }

            // ----- A: TRENDS 7D / 30D -----

            type DayBucket = {
                date: string;
                scans: number;
                unique_users: number;
                points: number;
                redemptions: number;
            };

            const dailyMap30 = new Map<string, DayBucket>(); // key: YYYY-MM-DD
            const userSetByDay30 = new Map<string, Set<string>>();

            // helper for date key
            const toDayKey = (d: Date) => d.toISOString().split("T")[0];

            // init last 30 days buckets
            for (let i = 0; i < 30; i++) {
                const d = new Date();
                d.setDate(now.getDate() - i);
                d.setHours(0, 0, 0, 0);
                const key = toDayKey(d);
                dailyMap30.set(key, {
                    date: key,
                    scans: 0,
                    unique_users: 0,
                    points: 0,
                    redemptions: 0,
                });
                userSetByDay30.set(key, new Set<string>());
            }

            // Process earn transactions into daily buckets, peaks, QR breakdown, customers, segments
            const qrTypeCounts: Record<string, number> = {};
            const qrTypePoints: Record<string, number> = {};

            const hourBuckets: number[] = new Array(24).fill(0);
            const weekdayBuckets: number[] = new Array(7).fill(0); // 0=Sun

            type CustomerAgg = {
                user_id: string;
                scans: number;
                points: number;
                last_scan: Date | null;
            };

            const customerAgg = new Map<string, CustomerAgg>();

            // For segments and new vs returning
            const customerScanCounts30 = new Map<string, number>();

            txQ.forEach((doc) => {
                const d = doc.data();
                const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
                const key = toDayKey(ts);
                const userId = d.user_id as string;
                const pts = Number(d.points || 0);
                const qrType = d.qr_type || "unknown";

                // daily 30
                if (dailyMap30.has(key)) {
                    const bucket = dailyMap30.get(key)!;
                    bucket.scans += 1;
                    bucket.points += pts;

                    const daySet = userSetByDay30.get(key)!;
                    daySet.add(userId);
                }

                // qr type breakdown
                qrTypeCounts[qrType] = (qrTypeCounts[qrType] || 0) + 1;
                qrTypePoints[qrType] = (qrTypePoints[qrType] || 0) + pts;

                // peak hours / days
                const hour = ts.getHours();
                const weekday = ts.getDay(); // 0-6
                hourBuckets[hour] += 1;
                weekdayBuckets[weekday] += 1;

                // customer aggregates
                const prev = customerAgg.get(userId) || {
                    user_id: userId,
                    scans: 0,
                    points: 0,
                    last_scan: null,
                };
                prev.scans += 1;
                prev.points += pts;
                if (!prev.last_scan || ts > prev.last_scan) {
                    prev.last_scan = ts;
                }
                customerAgg.set(userId, prev);

                // new vs returning (within 30-day window)
                customerScanCounts30.set(userId, (customerScanCounts30.get(userId) || 0) + 1);
            });

            // add redemption counts to daily
            if (redQ && !redQ.empty) {
                redQ.forEach((doc) => {
                    const d = doc.data();
                    const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
                    const key = toDayKey(ts);
                    if (dailyMap30.has(key)) {
                        const bucket = dailyMap30.get(key)!;
                        bucket.redemptions += 1;
                    }
                });
            }

            // finalize unique users per day
            dailyMap30.forEach((bucket, key) => {
                const set = userSetByDay30.get(key)!;
                bucket.unique_users = set.size;
            });

            // Build sorted trends arrays
            const trends30 = Array.from(dailyMap30.values()).sort((a, b) =>
                a.date.localeCompare(b.date)
            );

            const trends7 = trends30.slice(-7); // last 7 elements

            // ----- B: NEW VS RETURNING -----

            let newUsers30 = 0;
            let returningUsers30 = 0;
            customerScanCounts30.forEach((count) => {
                if (count <= 1) newUsers30 += 1;
                else returningUsers30 += 1;
            });

            const newVsReturning = {
                new: newUsers30,
                returning: returningUsers30,
            };

            // ----- C: PEAKS -----

            const peakHours = hourBuckets.map((count, hour) => ({ hour, scans: count }));
            const peakDays = weekdayBuckets.map((count, weekday) => ({ weekday, scans: count }));

            // ----- D: QR TYPE PERFORMANCE -----

            const qrTypeBreakdown = qrTypeCounts;
            const qrTypePointsMap = qrTypePoints;

            // ----- E: TOP CUSTOMERS -----

            const topCustomers = Array.from(customerAgg.values())
                .sort((a, b) => b.scans - a.scans)
                .slice(0, 20)
                .map((c) => ({
                    user_id: c.user_id,
                    total_scans: c.scans,
                    total_points: c.points,
                    last_scan: c.last_scan,
                }));

            // ----- F: REWARD REDEMPTION FUNNEL -----

            let totalRedemptions30 = 0;
            const redeemedCustomerSet = new Set<string>();

            if (redQ && !redQ.empty) {
                redQ.forEach((doc) => {
                    const d = doc.data();
                    totalRedemptions30 += 1;
                    if (d.user_id) redeemedCustomerSet.add(d.user_id as string);
                });
            }

            const earnedCustomers30 = customerAgg.size;
            const redeemedCustomers30 = redeemedCustomerSet.size;

            const rewardFunnel = {
                earned_customers: earnedCustomers30,
                redeemed_customers: redeemedCustomers30,
                total_redemptions: totalRedemptions30,
            };

            // ----- G: SEGMENTS (simple rules) -----

            let segNew = 0;
            let segRegular = 0;
            let segLoyal = 0;

            customerScanCounts30.forEach((count) => {
                if (count === 1) segNew += 1;
                else if (count >= 2 && count <= 3) segRegular += 1;
                else if (count >= 4) segLoyal += 1;
            });

            // Dormant: optional – customers with points but no scans in 30 days
            let segDormant = 0;
            try {
                const pointsQ = await db
                    .collection("points")
                    .where("seller_id", "==", sellerId)
                    .get();

                pointsQ.forEach((doc) => {
                    const d = doc.data();
                    const uid = d.user_id as string;
                    if (!customerScanCounts30.has(uid)) {
                        segDormant += 1;
                    }
                });
            } catch (e) {
                // ignore
            }

            const segments = {
                new: segNew,
                regular: segRegular,
                loyal: segLoyal,
                dormant: segDormant,
            };

            // ----- H: EXPORT STUB -----
            // We won't generate CSV here yet, but FE can use trends30, topCustomers, etc.
            // Later, you can add ?format=csv and stream CSV text based on these same aggregates.

            // FINAL RESPONSE
            return res.status(200).json({
                success: true,
                data: {
                    seller_id: sellerId,
                    seller_name: sellerData?.business.shop_name ?? null,
                    subscription_tier: tier,

                    // A
                    trends_7d: trends7,
                    trends_30d: trends30,

                    // B
                    new_vs_returning_30d: newVsReturning,

                    // C
                    peak_hours: peakHours,
                    peak_days: peakDays,

                    // D
                    qr_type_breakdown: qrTypeBreakdown,
                    qr_type_points: qrTypePointsMap,

                    // E
                    top_customers: topCustomers,

                    // F
                    reward_funnel: rewardFunnel,

                    // G
                    segments,

                    // H
                    export_available: tier === "premium",
                },
            });
        } catch (error: any) {
            console.error("sellerAdvancedAnalytics error:", error);
            return res
                .status(500)
                .json({ error: error.message || "Server error in advanced analytics" });
        }
    });
});
