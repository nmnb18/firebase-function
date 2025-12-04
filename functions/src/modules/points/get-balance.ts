// firebase-functions/src/points/getBalance.ts
import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const getPointsBalance = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            // Authenticate user
            const currentUser = await authenticateUser(req.headers.authorization);

            // Get all points documents for the user
            const pointsSnapshot = await db.collection("points")
                .where("user_id", "==", currentUser.uid)
                .get();

            if (pointsSnapshot.empty) {
                return res.status(200).json([]);
            }

            const balancePromises = pointsSnapshot.docs.map(async (pointDoc) => {
                const pointData = pointDoc.data();
                const sellerId = pointData.seller_id;

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

            const balances = await Promise.all(balancePromises);

            // Sort by points descending
            balances.sort((a, b) => b.points - a.points);

            return res.status(200).json(balances);

        } catch (error: any) {
            console.error("Get balance error:", error);
            return res.status(500).json({ error: error.message });
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
