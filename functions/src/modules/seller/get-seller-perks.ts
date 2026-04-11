import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const getSellerRedeemedPerksHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

            // 🔐 AUTH
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
            }

            const seller_id = currentUser.uid;


            // 1️⃣ Fetch claims
            const claimsSnap = await db
                .collection("today_offer_claims")
                .where("seller_id", "==", seller_id)
                .orderBy("created_at", "desc")
                .get();



            // 3️⃣ Normalize response
            const perks = claimsSnap.docs.map((doc) => {
                const claim = doc.data();
                return {
                    id: doc.id,
                    seller_id: claim.seller_id,
                    shop_name: claim.shop_name,
                    shop_logo_url: claim.seller_logo,
                    customer_name: claim.customer_name,
                    customer_contact: claim.customer_contact,
                    offer_id: claim.offer_id,
                    offer_title: claim.title,
                    min_spend: claim.min_spend,
                    terms: claim.terms,
                    date: claim.date,
                    expiry_date: `${claim.date}T23:59:59`, // EOD expiry
                    status: claim?.status || "CLAIMED",
                    redeem_code: claim?.redeem_code || null,
                    redeemed_at: claim?.created_at || null,
                };
            });

            return sendSuccess(res, { count: perks.length, perks }, HttpStatus.OK);

    } catch (err) {
        next(err);
    }
};
