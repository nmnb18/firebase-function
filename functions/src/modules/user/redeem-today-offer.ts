import { Request, Response, NextFunction } from "express";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { generateRedeemCode } from "../../utils/helper";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const redeemTodayOfferHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

                // 🔐 USER AUTH
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }

                const { seller_id } = req.body;
                if (!seller_id) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "seller_id required", HttpStatus.BAD_REQUEST);
                }

                const user_id = currentUser.uid;
                const today = new Date().toISOString().slice(0, 10);
                const claimId = `${user_id}_${seller_id}_${today}`;

                const claimRef = db.collection("today_offer_claims").doc(claimId);

                let responsePayload: any = null;

                await db.runTransaction(async (tx) => {
                    const claimSnap = await tx.get(claimRef);

                    if (!claimSnap.exists) {
                        throw new Error("No offer assigned for today");
                    }

                    const claim = claimSnap.data();

                    if (claim?.status === "REDEEMED") {
                        throw new Error("Offer already redeemed");
                    }

                    // 🔁 Redeem code already generated → return same
                    if (claim?.redeem_code) {
                        responsePayload = {
                            redeem_code: claim.redeem_code,
                            status: 'CLAIMED',
                            offer: {
                                title: claim.title,
                                min_spend: claim.min_spend,
                                terms: claim.terms,
                            },
                        };
                        return;
                    }

                    // 🔐 Generate unique redeem code
                    const redeem_code = generateRedeemCode();

                    await db
                        .collection("offer_redemptions")
                        .doc(redeem_code).set({
                            redeem_code,
                            user_id,
                            seller_id,
                            offer_id: claim?.offer_id,
                            date: today,
                            status: "PENDING",
                            created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                        });
                    // 2️⃣ Update today_offer_claims
                    tx.update(claimRef, {
                        redeem_code,
                        status: "CLAIMED",
                    });

                    responsePayload = {
                        redeem_code,
                        status: 'CLAIMED',
                        offer: {
                            title: claim?.title,
                            min_spend: claim?.min_spend,
                            terms: claim?.terms,
                        },
                    };
                });

                return sendSuccess(res, responsePayload, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
