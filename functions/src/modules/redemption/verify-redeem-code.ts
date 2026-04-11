import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import admin from "firebase-admin";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const verifyRedeemCodeHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

                // 🔐 Seller authentication
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }

                const seller_id = currentUser.uid;
                const { redeem_code } = req.body;

                if (!redeem_code) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "redeem_code required", HttpStatus.BAD_REQUEST);
                }

                const redemptionRef = db
                    .collection("offer_redemptions")
                    .doc(redeem_code);

                let resultPayload: any = null;

                await db.runTransaction(async (tx) => {
                    // 1️⃣ Fetch redemption
                    const redemptionSnap = await tx.get(redemptionRef);
                    if (!redemptionSnap.exists) {
                        throw new Error("Invalid redeem code");
                    }

                    const redemption = redemptionSnap.data();
                    if (!redemption) {
                        throw new Error("Invalid redeem code");
                    }

                    // 🧾 Ownership check
                    if (redemption.seller_id !== seller_id) {
                        throw new Error("This code does not belong to your store");
                    }

                    // 🚫 Already redeemed
                    if (redemption.status === "REDEEMED") {
                        throw new Error("Code already redeemed");
                    }

                    // 2️⃣ Fetch today offer claim
                    const claimId = `${redemption.user_id}_${seller_id}_${redemption.date}`;
                    const claimRef = db
                        .collection("today_offer_claims")
                        .doc(claimId);

                    const claimSnap = await tx.get(claimRef);
                    if (!claimSnap.exists) {
                        throw new Error("Offer claim not found");
                    }

                    const claim = claimSnap.data();
                    if (!claim) {
                        throw new Error("Offer claim not found");
                    }

                    // 3️⃣ Update redemption
                    tx.update(redemptionRef, {
                        status: "REDEEMED",
                        redeemed_at: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    // 4️⃣ Update today_offer_claims
                    tx.update(claimRef, {
                        status: "REDEEMED",
                        redeemed: true,
                    });

                    // ✅ Response payload
                    resultPayload = {
                        success: true,
                        redemption: {
                            redeemed: true,
                            redeem_code,
                            user_id: redemption.user_id,
                            seller_id,
                            date: redemption.date,

                            // 👇 OFFER DETAILS (from today_offer_claims)
                            offer: {
                                offer_id: claim.offer_id,
                                title: claim.title,
                                min_spend: claim.min_spend,
                                terms: claim.terms,
                            },
                        }

                    };
                });

                return sendSuccess(res, resultPayload, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
