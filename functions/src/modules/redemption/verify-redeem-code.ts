import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";
import admin from "firebase-admin";

interface VerifyRedeemCodeRequest {
    redeem_code: string;
}

export const verifyRedeemCode = createCallableFunction<
    VerifyRedeemCodeRequest,
    any
>(
    async (data, auth) => {
        const { redeem_code } = data;
        const sellerId = auth!.uid;

        if (!redeem_code) {
            throw new Error("redeem_code required");
        }

        const redemptionRef = db
            .collection("offer_redemptions")
            .doc(redeem_code);

        let resultPayload: any = null;

        await db.runTransaction(async (tx) => {
            // 1. Fetch redemption
            const redemptionSnap = await tx.get(redemptionRef);
            if (!redemptionSnap.exists) {
                throw new Error("Invalid redeem code");
            }

            const redemption = redemptionSnap.data();
            if (!redemption) {
                throw new Error("Invalid redeem code");
            }

            // Ownership check
            if (redemption.seller_id !== sellerId) {
                throw new Error("This code does not belong to your store");
            }

            // Already redeemed
            if (redemption.status === "REDEEMED") {
                throw new Error("Code already redeemed");
            }

            // 2. Fetch today offer claim
            const claimId = `${redemption.user_id}_${sellerId}_${redemption.date}`;
            const claimRef = db.collection("today_offer_claims").doc(claimId);

            const claimSnap = await tx.get(claimRef);
            if (!claimSnap.exists) {
                throw new Error("Offer claim not found");
            }

            const claim = claimSnap.data();
            if (!claim) {
                throw new Error("Offer claim not found");
            }

            // 3. Update redemption
            tx.update(redemptionRef, {
                status: "REDEEMED",
                redeemed_at: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 4. Update today_offer_claims
            tx.update(claimRef, {
                status: "REDEEMED",
                redeemed: true,
            });

            // Response payload
            resultPayload = {
                success: true,
                redemption: {
                    redeemed: true,
                    redeem_code,
                    user_id: redemption.user_id,
                    seller_id: sellerId,
                    date: redemption.date,

                    // OFFER DETAILS (from today_offer_claims)
                    offer: {
                        offer_id: claim.offer_id,
                        title: claim.title,
                        min_spend: claim.min_spend,
                        terms: claim.terms,
                    },
                },
            };
        });

        return resultPayload;
    },
    { region: "asia-south1", requireAuth: true }
);
