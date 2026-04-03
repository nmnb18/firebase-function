import { Request, Response } from "express";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { createCache } from "../../utils/cache";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });
const cache = createCache();

export const getUserPerksHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "GET") {
                    return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "GET only", HttpStatus.METHOD_NOT_ALLOWED);
                }

                // 🔐 AUTH
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }

                const user_id = currentUser.uid;
                // const { seller_id } = req.query;
                // const today = new Date().toISOString().slice(0, 10);

                // Check cache (60s TTL)
                // const cacheKey = `user_perks:${user_id}`;
                // const cachedPerks = cache.get<any>(cacheKey);
                // if (cachedPerks) {
                //     return res.status(200).json(cachedPerks);
                // }

                /* --------------------------------------------------
                   CASE 1️⃣ → Seller specific (used to hide CTA)
                -------------------------------------------------- */
                // if (seller_id) {
                //     const claimSnap = await db
                //         .collection("today_offer_claims")
                //         .where("user_id", "==", user_id)
                //         .where("seller_id", "==", seller_id)
                //         .where("date", "==", today)
                //         .limit(1)
                //         .get();

                //     if (claimSnap.empty) {
                //         return res.status(200).json({
                //             success: true,
                //             hasPerkToday: false,
                //         });
                //     }

                //     const claim = claimSnap.docs[0].data();

                //     return res.status(200).json({
                //         success: true,
                //         hasPerkToday: true,
                //         perk: {
                //             offer_id: claim.offer_id,
                //             title: claim.title,
                //             status: claim.status,
                //             redeemed: claim.redeemed,
                //         },
                //     });
                // }

                /* --------------------------------------------------
                   CASE 2️⃣ → Full Perk History
                -------------------------------------------------- */

                // 1️⃣ Fetch claims
                const claimsSnap = await db
                    .collection("today_offer_claims")
                    .where("user_id", "==", user_id)
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

                const responseData = {
                    success: true,
                    count: perks.length,
                    perks,
                };

                // Cache result (60s TTL)
                //cache.set(cacheKey, responseData, 60000);

                return sendSuccess(res, { count: perks.length, perks }, HttpStatus.OK);

            } catch (err: any) {
                console.error("getUserPerks error:", err);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, err.message, err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};
