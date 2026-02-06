import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface GetBalanceBySellerInput {
  seller_id: string;
}
interface GetBalanceBySellerOutput {
  seller_id: string;
  seller_name: string;
  points: number;
  reward_points: number;
  reward_description: string;
  can_redeem: boolean;
  offers: any[];
  reward_type: string;
}

// Helper function to generate reward description
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

export const getBalanceBySeller = createCallableFunction<GetBalanceBySellerInput, GetBalanceBySellerOutput>(
  async (data, auth, context) => {
    try {
      const currentUser = { uid: auth!.uid };
      const sellerId = data.seller_id;

      if (!sellerId) {
        throw new functions.https.HttpsError('invalid-argument', 'seller_id is required');
      }

                // ------------------------------------------
                // Get points for THIS user + THIS seller
                // ------------------------------------------
                const pointsSnapshot = await db.collection("points")
                    .where("user_id", "==", currentUser.uid)
                    .where("seller_id", "==", sellerId)
                    .get();

                if (pointsSnapshot.empty) {
                    throw new functions.https.HttpsError('not-found', 'No points found for this seller');
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

      return balance;
    } catch (error: any) {
      console.error("Get single seller balance error:", error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  },
  {
    region: 'asia-south1',
    requireAuth: true
  }
);
