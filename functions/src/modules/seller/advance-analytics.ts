import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const sellerAdvancedAnalytics = functions.https.onRequest(
    { region: 'asia-south1' }, async (req, res) => {
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
                const tier: "free" | "pro" | "premium" = sellerData?.subscription?.tier || "free";

                // Block free tier
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

                // Transactions (earn only) LAST 30 DAYS
                const txQ = await db
                    .collection("transactions")
                    .where("seller_id", "==", sellerId)
                    .where("transaction_type", "==", "earn")
                    .where("timestamp", ">=", last30)
                    .get();

                // Redemptions LAST 30 DAYS - UPDATED
                const redQ = await db
                    .collection("redemptions")
                    .where("seller_id", "==", sellerId)
                    .where("created_at", ">=", last30)
                    .get();

                // ----- A: TRENDS 7D / 30D -----

                type DayBucket = {
                    date: string;
                    scans: number;
                    unique_users: number;
                    points_issued: number;
                    redemptions: number;
                    points_redeemed: number; // NEW
                };

                const dailyMap30 = new Map<string, DayBucket>();
                const userSetByDay30 = new Map<string, Set<string>>();

                const toDayKey = (d: Date) => d.toISOString().split("T")[0];

                // Initialize last 30 days buckets
                for (let i = 0; i < 30; i++) {
                    const d = new Date();
                    d.setDate(now.getDate() - i);
                    d.setHours(0, 0, 0, 0);
                    const key = toDayKey(d);
                    dailyMap30.set(key, {
                        date: key,
                        scans: 0,
                        unique_users: 0,
                        points_issued: 0,
                        redemptions: 0,
                        points_redeemed: 0,
                    });
                    userSetByDay30.set(key, new Set<string>());
                }

                // Process earn transactions
                const qrTypeCounts: Record<string, number> = {};
                const qrTypePoints: Record<string, number> = {};

                const hourBuckets: number[] = new Array(24).fill(0);
                const weekdayBuckets: number[] = new Array(7).fill(0);

                type CustomerAgg = {
                    user_id: string;
                    customer_name: string;
                    scans: number;
                    points_earned: number;
                    points_redeemed: number; // NEW
                    redemptions: number; // NEW
                    last_scan: Date | null;
                    last_redemption: Date | null; // NEW
                };

                const customerAgg = new Map<string, CustomerAgg>();

                // For segments and new vs returning
                const customerScanCounts30 = new Map<string, number>();

                txQ.forEach((doc) => {
                    const d = doc.data();
                    const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
                    const key = toDayKey(ts);
                    const userId = d.user_id as string;
                    const customerName = d.customer_name;
                    const pts = Number(d.points || 0);
                    const qrType = d.qr_type || "unknown";

                    // Daily 30
                    if (dailyMap30.has(key)) {
                        const bucket = dailyMap30.get(key)!;
                        bucket.scans += 1;
                        bucket.points_issued += pts;

                        const daySet = userSetByDay30.get(key)!;
                        daySet.add(userId);
                    }

                    // QR type breakdown
                    qrTypeCounts[qrType] = (qrTypeCounts[qrType] || 0) + 1;
                    qrTypePoints[qrType] = (qrTypePoints[qrType] || 0) + pts;

                    // Peak hours/days
                    const hour = ts.getHours();
                    const weekday = ts.getDay();
                    hourBuckets[hour] += 1;
                    weekdayBuckets[weekday] += 1;

                    // Customer aggregates
                    const prev = customerAgg.get(userId) || {
                        user_id: userId,
                        customer_name: customerName,
                        scans: 0,
                        points_earned: 0,
                        points_redeemed: 0,
                        redemptions: 0,
                        last_scan: null,
                        last_redemption: null,
                    };
                    prev.scans += 1;
                    prev.points_earned += pts;
                    if (!prev.last_scan || ts > prev.last_scan) {
                        prev.last_scan = ts;
                    }
                    customerAgg.set(userId, prev);

                    // New vs returning
                    customerScanCounts30.set(userId, (customerScanCounts30.get(userId) || 0) + 1);
                });

                // Process redemptions - UPDATED
                redQ.forEach((doc) => {
                    const d = doc.data();
                    const ts = d.created_at?.toDate ? d.created_at.toDate() : new Date(d.created_at);
                    const key = toDayKey(ts);
                    const userId = d.user_id as string;
                    const customerName = d.user_name;
                    const points = Number(d.points || 0);
                    const status = d.status;

                    if (dailyMap30.has(key)) {
                        const bucket = dailyMap30.get(key)!;
                        if (status === "redeemed") {
                            bucket.redemptions += 1;
                            bucket.points_redeemed += points;
                        }
                    }

                    // Update customer aggregates for redemptions
                    if (status === "redeemed") {
                        const prev = customerAgg.get(userId) || {
                            user_id: userId,
                            customer_name: customerName,
                            scans: 0,
                            points_earned: 0,
                            points_redeemed: 0,
                            redemptions: 0,
                            last_scan: null,
                            last_redemption: null,
                        };
                        prev.points_redeemed += points;
                        prev.redemptions += 1;
                        if (!prev.last_redemption || ts > prev.last_redemption) {
                            prev.last_redemption = ts;
                        }
                        customerAgg.set(userId, prev);
                    }
                });

                // Finalize unique users per day
                dailyMap30.forEach((bucket, key) => {
                    const set = userSetByDay30.get(key)!;
                    bucket.unique_users = set.size;
                });

                // Build sorted trends arrays
                const trends30 = Array.from(dailyMap30.values()).sort((a, b) =>
                    a.date.localeCompare(b.date)
                );
                const trends7 = trends30.slice(-7);

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

                // ----- E: TOP CUSTOMERS - UPDATED with redemption info -----
                const topCustomers = Array.from(customerAgg.values())
                    .sort((a, b) => b.scans - a.scans)
                    .slice(0, 20)
                    .map((c) => ({
                        user_id: c.user_id,
                        customer_name: c.customer_name,
                        total_scans: c.scans,
                        total_points_earned: c.points_earned,
                        total_points_redeemed: c.points_redeemed,
                        total_redemptions: c.redemptions,
                        redemption_ratio: c.points_earned > 0
                            ? Math.round((c.points_redeemed / c.points_earned) * 100)
                            : 0,
                        last_scan: c.last_scan,
                        last_redemption: c.last_redemption,
                    }));

                // ----- F: REWARD REDEMPTION FUNNEL - ENHANCED -----
                const redeemedCustomerSet = new Set<string>();
                const pendingCustomerSet = new Set<string>();
                let totalRedemptions30 = 0;
                let pendingRedemptions30 = 0;
                let totalPointsRedeemed30 = 0;

                redQ.forEach((doc) => {
                    const d = doc.data();
                    const userId = d.user_id as string;
                    const points = Number(d.points || 0);
                    const status = d.status;

                    if (status === "redeemed") {
                        totalRedemptions30++;
                        totalPointsRedeemed30 += points;
                        redeemedCustomerSet.add(userId);
                    } else if (status === "pending") {
                        pendingRedemptions30++;
                        pendingCustomerSet.add(userId);
                    }
                });

                const earnedCustomers30 = customerAgg.size;
                const redeemedCustomers30 = redeemedCustomerSet.size;
                const pendingCustomers30 = pendingCustomerSet.size;

                const rewardFunnel = {
                    earned_customers: earnedCustomers30,
                    redeemed_customers: redeemedCustomers30,
                    pending_customers: pendingCustomers30,
                    total_redemptions: totalRedemptions30,
                    pending_redemptions: pendingRedemptions30,
                    total_points_redeemed: totalPointsRedeemed30,
                    redemption_rate: earnedCustomers30 > 0
                        ? Math.round((redeemedCustomers30 / earnedCustomers30) * 100)
                        : 0,
                    average_redemption_value: redeemedCustomers30 > 0
                        ? Math.round(totalPointsRedeemed30 / redeemedCustomers30)
                        : 0,
                };

                // ----- G: SEGMENTS - ENHANCED with redemption behavior -----
                let segNew = 0;
                let segRegular = 0;
                let segLoyal = 0;
                let segRedeemer = 0; // Customers who have redeemed
                let segHighValue = 0; // Customers with high redemption value

                customerScanCounts30.forEach((count, userId) => {
                    const customer = customerAgg.get(userId);
                    const hasRedeemed = customer?.redemptions && customer?.redemptions > 0;
                    const redemptionRatio = customer?.points_earned && customer?.points_earned > 0
                        ? (customer.points_redeemed / customer.points_earned)
                        : 0;

                    if (count === 1) segNew += 1;
                    else if (count >= 2 && count <= 3) segRegular += 1;
                    else if (count >= 4) segLoyal += 1;

                    if (hasRedeemed) segRedeemer += 1;
                    if (redemptionRatio >= 0.5) segHighValue += 1; // Redeemed at least 50% of earned points
                });

                // Dormant customers
                let segDormant = 0;
                try {
                    const pointsQ = await db
                        .collection("points")
                        .where("seller_id", "==", sellerId)
                        .get();

                    pointsQ.forEach((doc) => {
                        const d = doc.data();
                        const uid = d.user_id as string;
                        const points = Number(d.points || 0);
                        // Customer has points but no scans in 30 days AND no pending redemptions
                        if (!customerScanCounts30.has(uid) && points > 0) {
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
                    redeemer: segRedeemer,
                    high_value: segHighValue,
                    dormant: segDormant,
                };

                // ----- H: REDEMPTION ANALYTICS - NEW SECTION -----
                const redemptionAnalytics = {
                    average_processing_time: await calculateAverageProcessingTime(sellerId),
                    popular_redemption_points: await getPopularRedemptionPoints(sellerId),
                    peak_redemption_hours: await getPeakRedemptionHours(sellerId),
                    failed_redemptions: await getFailedRedemptionsCount(sellerId, last30),
                };

                // ----- FINAL RESPONSE -----
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
                        redemption_analytics: redemptionAnalytics,

                        // I
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

// Helper functions for redemption analytics
async function calculateAverageProcessingTime(sellerId: string): Promise<number> {
    const redeemedRedemptions = await db.collection("redemptions")
        .where("seller_id", "==", sellerId)
        .where("status", "==", "redeemed")
        .get();

    let totalProcessingTime = 0;
    let count = 0;

    redeemedRedemptions.forEach(doc => {
        const redemption = doc.data();
        if (redemption.created_at && redemption.redeemed_at) {
            const created = redemption.created_at.toDate ?
                redemption.created_at.toDate() : new Date(redemption.created_at);
            const redeemed = redemption.redeemed_at.toDate ?
                redemption.redeemed_at.toDate() : new Date(redemption.redeemed_at);

            const processingTime = redeemed.getTime() - created.getTime();
            totalProcessingTime += processingTime;
            count++;
        }
    });

    return count > 0 ? Math.round(totalProcessingTime / count / (1000 * 60)) : 0; // minutes
}

async function getPopularRedemptionPoints(sellerId: string): Promise<Array<{ points: number, count: number }>> {
    const redeemedRedemptions = await db.collection("redemptions")
        .where("seller_id", "==", sellerId)
        .where("status", "==", "redeemed")
        .get();

    const pointsMap = new Map<number, number>();

    redeemedRedemptions.forEach(doc => {
        const redemption = doc.data();
        const points = Number(redemption.points || 0);
        pointsMap.set(points, (pointsMap.get(points) || 0) + 1);
    });

    return Array.from(pointsMap.entries())
        .map(([points, count]) => ({ points, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}

async function getPeakRedemptionHours(sellerId: string): Promise<Array<{ hour: number, count: number }>> {
    const redeemedRedemptions = await db.collection("redemptions")
        .where("seller_id", "==", sellerId)
        .where("status", "==", "redeemed")
        .where("redeemed_at", ">=", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .get();

    const hourBuckets = new Array(24).fill(0);

    redeemedRedemptions.forEach(doc => {
        const redemption = doc.data();
        const redeemedAt = redemption.redeemed_at?.toDate ?
            redemption.redeemed_at.toDate() : new Date(redemption.redeemed_at);
        const hour = redeemedAt.getHours();
        hourBuckets[hour]++;
    });

    return hourBuckets.map((count, hour) => ({ hour, count }));
}

async function getFailedRedemptionsCount(sellerId: string, sinceDate: Date): Promise<number> {
    const failedRedemptions = await db.collection("redemptions")
        .where("seller_id", "==", sellerId)
        .where("status", "in", ["cancelled", "expired"])
        .where("created_at", ">=", sinceDate)
        .count()
        .get();

    return failedRedemptions.data().count;
}
