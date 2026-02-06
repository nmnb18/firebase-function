import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface GetPointsBalanceInput {}
interface GetPointsBalanceOutput {
  balances: any[];
  stats: any;
}

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

export const getPointsBalance = createCallableFunction<GetPointsBalanceInput, GetPointsBalanceOutput>(
  async (data, auth, context) => {
    try {
      const currentUser = { uid: auth!.uid };

                // Get all points documents for the user
                const pointsSnapshot = await db.collection("points")
                    .where("user_id", "==", currentUser.uid)
                    .get();

                if (pointsSnapshot.empty) {
                    return { balances: [], stats: { available_points: 0, total_points_earned: 0, points_wating_redeem: 0, total_points_redeem: 0 } };
                }

                const pointsHoldSnapshot = await db.collection("points_hold")
                    .where("user_id", "==", currentUser.uid)
                    .get();

                // Calculate total points held/reserved
                let totalPointsHeld = 0;
                pointsHoldSnapshot.forEach(doc => {
                    const holdData = doc.data();
                    // Parse points as number (they're stored as string in your example)
                    const points = parseInt(holdData.points) || 0;
                    totalPointsHeld += points;
                });

                const redemptionsSnapshot = await db.collection("redemptions")
                    .where("user_id", "==", currentUser.uid)
                    .get();
                let pointsWaitingRedeem = 0;
                let totalPointsRedeemed = 0;
                redemptionsSnapshot.forEach(doc => {
                    const redemptionData = doc.data();
                    // Parse points as number (they're stored as string in your example)
                    if (redemptionData.status === 'pending') {
                        const points = parseInt(redemptionData.points) || 0;
                        pointsWaitingRedeem += points;
                    } else {
                        const points = parseInt(redemptionData.points) || 0;
                        totalPointsRedeemed += points;
                    }

                });
                let totalPointsEarned = 0;
                const balancePromises = pointsSnapshot.docs.map(async (pointDoc) => {
                    const pointData = pointDoc.data();
                    const sellerId = pointData.seller_id;
                    totalPointsEarned += pointData.points || 0;
                    // Get seller details
                    const sellerDoc = await db.collection("seller_profiles").doc(sellerId).get();
                    const sellerData = sellerDoc.exists ? sellerDoc.data() : null;

                    // Get seller's reward configuration
                    const rewardConfig = sellerData?.rewards || {};
                    const offers = rewardConfig.offers || [];

                    // Find minimum offer points
                    let minOfferPoints = 0;
                    if (offers.length > 0) {
                        const offerPoints = offers.map((offer: any) => offer.reward_points || 0);
                        minOfferPoints = Math.min(...offerPoints);
                    } else {
                        // Fallback to default reward_points
                        minOfferPoints = rewardConfig.reward_points || rewardConfig.default_points_value || 100;
                    }


                    // Simple can_redeem logic: user points >= minimum offer points
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
                let availablePoints = totalPointsEarned - totalPointsHeld;
                const balances = await Promise.all(balancePromises);

                // Sort by points descending
                balances.sort((a, b) => b.points - a.points);

      return {
        balances,
        stats: {
          available_points: availablePoints,
          total_points_earned: totalPointsEarned,
          points_wating_redeem: pointsWaitingRedeem,
          total_points_redeem: totalPointsRedeemed
        }
      };
    } catch (error: any) {
      console.error("Get balance error:", error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  },
  {
    region: 'asia-south1',
    requireAuth: true
  }
);
