import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const getBalanceBySellerHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
                const currentUser = await authenticateUser(req.headers.authorization);
                const sellerId = req.query.seller_id as string;

                if (!sellerId) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "seller_id is required", HttpStatus.BAD_REQUEST);
                }

                // ------------------------------------------
                // Parallel: Get points + seller profile
                // ------------------------------------------
                const [pointsSnapshot, sellerDoc] = await Promise.all([
                    db.collection("points")
                        .where("user_id", "==", currentUser.uid)
                        .where("seller_id", "==", sellerId)
                        .get(),
                    db.collection("seller_profiles").doc(sellerId).get()
                ]);

                if (pointsSnapshot.empty) {
                    return sendSuccess(res, {}, HttpStatus.OK);
                }

                // ------------------------------------------
                // Calculate earned points for THIS seller
                // ------------------------------------------
                const pointDoc = pointsSnapshot.docs[0];
                const pointData = pointDoc.data();
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


                return sendSuccess(res, balance, HttpStatus.OK);

    } catch (err) {
        next(err);
    }
};

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
