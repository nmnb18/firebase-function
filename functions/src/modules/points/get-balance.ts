// firebase-functions/src/points/getBalance.ts
import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { createCache } from "../../utils/cache";

const corsHandler = cors({ origin: true });
const cache = createCache();

export const getPointsBalance = functions.https.onRequest(
    { region: 'asia-south1', minInstances: 1, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            try {
                // Authenticate user
                const currentUser = await authenticateUser(req.headers.authorization);

                // Check cache (120s TTL for points balance)
                const cacheKey = `points_balance:${currentUser.uid}`;
                const cached = cache.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json(cached);
                }

                // Parallel: Get all points, holds, and redemptions
                const [pointsSnapshot, pointsHoldSnapshot, redemptionsSnapshot] = await Promise.all([
                    db.collection("points")
                        .where("user_id", "==", currentUser.uid)
                        .get(),
                    db.collection("points_hold")
                        .where("user_id", "==", currentUser.uid)
                        .get(),
                    db.collection("redemptions")
                        .where("user_id", "==", currentUser.uid)
                        .get()
                ]);

                if (pointsSnapshot.empty) {
                    return res.status(200).json([]);
                }

                // Calculate total points held/reserved
                let totalPointsHeld = 0;
                pointsHoldSnapshot.forEach(doc => {
                    const holdData = doc.data();
                    const points = parseInt(holdData.points) || 0;
                    totalPointsHeld += points;
                });

                // Calculate pending and redeemed points
                let pointsWaitingRedeem = 0;
                let totalPointsRedeemed = 0;
                redemptionsSnapshot.forEach(doc => {
                    const redemptionData = doc.data();
                    if (redemptionData.status === 'pending') {
                        const points = parseInt(redemptionData.points) || 0;
                        pointsWaitingRedeem += points;
                    } else {
                        const points = parseInt(redemptionData.points) || 0;
                        totalPointsRedeemed += points;
                    }
                });

                // Get all seller profiles in parallel
                const sellerIds = pointsSnapshot.docs.map(doc => doc.data().seller_id);
                const sellerDocs = await Promise.all(
                    sellerIds.map(id => db.collection("seller_profiles").doc(id).get())
                );

                // Create seller lookup map
                const sellerMap = new Map();
                sellerDocs.forEach(doc => {
                    if (doc.exists) {
                        sellerMap.set(doc.id, doc.data());
                    }
                });

                // Calculate balances with seller data
                let totalPointsEarned = 0;
                const balances = pointsSnapshot.docs.map(pointDoc => {
                    const pointData = pointDoc.data();
                    const sellerId = pointData.seller_id;
                    totalPointsEarned += pointData.points || 0;

                    const sellerData = sellerMap.get(sellerId);
                    const rewardConfig = sellerData?.rewards || {};
                    const offers = rewardConfig.offers || [];

                    // Find minimum offer points
                    let minOfferPoints = 0;
                    if (offers.length > 0) {
                        const offerPoints = offers.map((offer: any) => offer.reward_points || 0);
                        minOfferPoints = Math.min(...offerPoints);
                    } else {
                        minOfferPoints = rewardConfig.reward_points || rewardConfig.default_points_value || 100;
                    }

                    const canRedeem = pointData.points >= minOfferPoints;
                    return {
                        seller_id: sellerId,
                        seller_name: sellerData?.business?.shop_name || "Unknown Store",
                        points: pointData.points || 0,
                        reward_points: rewardConfig.reward_points || rewardConfig.default_points_value || 100,
                        reward_description: getRewardDescription(rewardConfig),
                        can_redeem: canRedeem,
                        offers: rewardConfig.offers || [],
                        reward_type: rewardConfig.reward_type || 'default'
                    };
                });

                // Sort by points descending
                balances.sort((a, b) => b.points - a.points);

                const availablePoints = totalPointsEarned - totalPointsHeld;
                const responseData = {
                    balances,
                    stats: {
                        available_points: availablePoints,
                        total_points_earned: totalPointsEarned,
                        points_wating_redeem: pointsWaitingRedeem,
                        total_points_redeem: totalPointsRedeemed
                    }
                };

                // Cache result (120s TTL)
                cache.set(cacheKey, responseData, 120000);

                return res.status(200).json(responseData);

            } catch (error: any) {
                console.error("Get balance error:", error);
                return res.status(err.statusCode ?? 500).json({ error: error.message });
            }
        });
    });

// Helper function to generate reward description
function getRewardDescription(rewardConfig: any): string {
    const rewardType = rewardConfig.reward_type || 'default';
    const rewardPoints = rewardConfig.reward_points || rewardConfig.default_points_value || 100;

    if (rewardConfig.offers && Array.isArray(rewardConfig.offers) && rewardConfig.offers.length > 0) {
        const offers = rewardConfig.offers;
        const minPoints = Math.min(...offers.map((offer: any) => offer.reward_points || 0));
        const maxPoints = Math.max(...offers.map((offer: any) => offer.reward_points || 0));

        if (offers.length === 1) {
            return `Redeem ${offers[0].reward_name} for ${offers[0].reward_points} points`;
        } else {
            return `${offers.length} offers available (${minPoints}-${maxPoints} points)`;
        }
    }

    switch (rewardType) {
        case 'percentage':
            const percentage = rewardConfig.percentage_value || 1;
            return `Earn ${percentage}% cashback as points`;

        case 'flat':
            const flatPoints = rewardConfig.flat_points || 1;
            return `Earn ${flatPoints} points per transaction`;

        case 'slab':
            if (Array.isArray(rewardConfig.slab_rules) && rewardConfig.slab_rules.length > 0) {
                const rules = rewardConfig.slab_rules.map((rule: any) =>
                    `₹${rule.min}-₹${rule.max}: ${rule.points}pts`
                ).join(', ');
                return `Slab rewards: ${rules}`;
            }
            return `Earn points based on amount spent`;

        case 'default':
        default:
            return `Redeem after ${rewardPoints} points`;
    }
}
