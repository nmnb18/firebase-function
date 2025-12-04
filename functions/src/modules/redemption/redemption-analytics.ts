// firebase-functions/src/redemption/redemptionAnalytics.ts
import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const redemptionAnalytics = functions.https.onRequest(async (req, res) => {
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
            const tier = sellerData?.subscription?.tier || "free";

            // Time ranges
            const now = new Date();
            const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

            // Get all redemptions
            const redemptionsQuery = await db.collection("redemptions")
                .where("seller_id", "==", sellerId)
                .get();

            const redemptions: any[] = [];
            redemptionsQuery.forEach(doc => {
                const data = doc.data();
                redemptions.push({
                    id: doc.id,
                    ...data,
                    created_at: data.created_at?.toDate?.() || data.created_at,
                    redeemed_at: data.redeemed_at?.toDate?.() || data.redeemed_at,
                    expires_at: data.expires_at?.toDate?.() || data.expires_at
                });
            });

            // Calculate metrics
            const metrics = {
                total: redemptions.length,
                pending: redemptions.filter(r => r.status === "pending").length,
                redeemed: redemptions.filter(r => r.status === "redeemed").length,
                cancelled: redemptions.filter(r => r.status === "cancelled").length,
                expired: redemptions.filter(r => r.status === "expired").length,

                total_points: redemptions.reduce((sum, r) => sum + (r.points || 0), 0),
                redeemed_points: redemptions
                    .filter(r => r.status === "redeemed")
                    .reduce((sum, r) => sum + (r.points || 0), 0),
                pending_points: redemptions
                    .filter(r => r.status === "pending")
                    .reduce((sum, r) => sum + (r.points || 0), 0),

                // Last 7 days
                last7days: {
                    total: redemptions.filter(r =>
                        r.created_at && new Date(r.created_at) >= last7
                    ).length,
                    redeemed: redemptions.filter(r =>
                        r.status === "redeemed" &&
                        r.redeemed_at &&
                        new Date(r.redeemed_at) >= last7
                    ).length,
                    points_redeemed: redemptions
                        .filter(r =>
                            r.status === "redeemed" &&
                            r.redeemed_at &&
                            new Date(r.redeemed_at) >= last7
                        )
                        .reduce((sum, r) => sum + (r.points || 0), 0)
                },

                // Last 30 days
                last30days: {
                    total: redemptions.filter(r =>
                        r.created_at && new Date(r.created_at) >= last30
                    ).length,
                    redeemed: redemptions.filter(r =>
                        r.status === "redeemed" &&
                        r.redeemed_at &&
                        new Date(r.redeemed_at) >= last30
                    ).length,
                    points_redeemed: redemptions
                        .filter(r =>
                            r.status === "redeemed" &&
                            r.redeemed_at &&
                            new Date(r.redeemed_at) >= last30
                        )
                        .reduce((sum, r) => sum + (r.points || 0), 0)
                },

                // Customer stats
                unique_customers: new Set(redemptions.map(r => r.user_id)).size,
                repeat_customers: (() => {
                    const customerCounts = redemptions.reduce((acc, r) => {
                        acc[r.user_id] = (acc[r.user_id] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>);

                    return Object.values(customerCounts).filter((count: any) => count > 1).length;
                })(),

                // Average values
                average_redemption_value: (() => {
                    const redeemed = redemptions.filter(r => r.status === "redeemed");
                    return redeemed.length > 0
                        ? Math.round(redeemed.reduce((sum, r) => sum + (r.points || 0), 0) / redeemed.length)
                        : 0;
                })(),

                average_processing_time_minutes: (() => {
                    const redeemed = redemptions.filter(r =>
                        r.status === "redeemed" &&
                        r.created_at &&
                        r.redeemed_at
                    );

                    if (redeemed.length === 0) return 0;

                    const totalTime = redeemed.reduce((sum, r) => {
                        const created = new Date(r.created_at);
                        const redeemedAt = new Date(r.redeemed_at);
                        return sum + (redeemedAt.getTime() - created.getTime());
                    }, 0);

                    return Math.round(totalTime / redeemed.length / (1000 * 60));
                })()
            };

            // Top customers by redemptions
            const customerRedemptions = redemptions.reduce((acc, r) => {
                if (!acc[r.user_id]) {
                    acc[r.user_id] = {
                        user_id: r.user_id,
                        user_name: r.user_name,
                        total_redemptions: 0,
                        total_points: 0,
                        last_redemption: r.created_at
                    };
                }
                acc[r.user_id].total_redemptions++;
                acc[r.user_id].total_points += r.points || 0;
                if (r.created_at > acc[r.user_id].last_redemption) {
                    acc[r.user_id].last_redemption = r.created_at;
                }
                return acc;
            }, {} as Record<string, any>);

            const topCustomers = Object.values(customerRedemptions)
                .sort((a: any, b: any) => b.total_points - a.total_points)
                .slice(0, 10);

            // Redemption value distribution
            const valueDistribution = redemptions
                .filter(r => r.status === "redeemed")
                .reduce((acc, r) => {
                    const points = r.points || 0;
                    let range = "";

                    if (points < 100) range = "1-99";
                    else if (points < 500) range = "100-499";
                    else if (points < 1000) range = "500-999";
                    else range = "1000+";

                    acc[range] = (acc[range] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);

            return res.status(200).json({
                success: true,
                data: {
                    seller_id: sellerId,
                    seller_name: sellerData?.business.shop_name,
                    subscription_tier: tier,
                    metrics,
                    top_customers: topCustomers,
                    value_distribution: valueDistribution,
                    redemptions: redemptions.slice(0, 50) // Return recent redemptions
                }
            });

        } catch (error: any) {
            console.error("Redemption analytics error:", error);
            return res.status(500).json({ error: error.message });
        }
    });
});