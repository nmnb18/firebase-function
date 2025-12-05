import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const getBalanceBySeller = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            const currentUser = await authenticateUser(req.headers.authorization);
            const sellerId = req.query.seller_id as string;

            if (!sellerId) {
                console.log('here', req)
                return res.status(400).json({ error: "seller_id is required" });
            }

            // ------------------------------------------
            // Get points for THIS user + THIS seller
            // ------------------------------------------
            const pointsSnapshot = await db.collection("points")
                .where("user_id", "==", currentUser.uid)
                .where("seller_id", "==", sellerId)
                .get();

            if (pointsSnapshot.empty) {
                return res.status(200).json({});
            }

            // ------------------------------------------
            // Calculate earned points for THIS seller
            // ------------------------------------------
            const pointDoc = pointsSnapshot.docs[0];
            const pointData = pointDoc.data();

            const sellerDoc = await db.collection("seller_profiles").doc(sellerId).get();
            const sellerData = sellerDoc.exists ? sellerDoc.data() : null;

            const rewardConfig = sellerData?.rewards || {};
            const offers = rewardConfig.offers || [];

            let minOfferPoints = 0;

            if (offers.length > 0) {
                const offerPoints = offers.map((o: any) => o.reward_points || 0);
                minOfferPoints = Math.min(...offerPoints);
            } else {
                minOfferPoints = rewardConfig.reward_points || rewardConfig.default_points_value || 100;
            }

            const canRedeem = pointData.points >= minOfferPoints;

            const balance = {
                seller_id: sellerId,
                seller_name: sellerData?.business?.shop_name || "Unknown Store",
                points: pointData.points || 0,
                reward_points: rewardConfig.reward_points || rewardConfig.default_points_value || 100,
                reward_description: getRewardDescription(rewardConfig),
                can_redeem: canRedeem,
                offers: offers,
                reward_type: rewardConfig.reward_type || "default"
            };


            return res.status(200).json(balance);

        } catch (error: any) {
            console.error("Get single seller balance error:", error);
            return res.status(500).json({ error: error.message });
        }
    });
});

function getRewardDescription(rewardConfig: any): string {
    const rewardType = rewardConfig.reward_type || 'default';
    const rewardPoints = rewardConfig.reward_points || rewardConfig.default_points_value || 100;

    if (rewardConfig.offers?.length > 0) {
        const offers = rewardConfig.offers;
        const minPoints = Math.min(...offers.map((o: any) => o.reward_points || 0));
        const maxPoints = Math.max(...offers.map((o: any) => o.reward_points || 0));

        if (offers.length === 1) {
            return `Redeem ${offers[0].reward_name} for ${offers[0].reward_points} points`;
        } else {
            return `${offers.length} offers available (${minPoints}-${maxPoints} points)`;
        }
    }

    switch (rewardType) {
        case "percentage":
            return `Earn ${rewardConfig.percentage_value || 1}% cashback as points`;
        case "flat":
            return `Earn ${rewardConfig.flat_points || 1} points per transaction`;
        case "slab":
            if (rewardConfig.slab_rules?.length > 0) {
                const rules = rewardConfig.slab_rules
                    .map((r: any) => `₹${r.min}-₹${r.max}: ${r.points}pts`)
                    .join(", ");
                return `Slab rewards: ${rules}`;
            }
            return "Slab-based reward system";
        default:
            return `Redeem after ${rewardPoints} points`;
    }
}
