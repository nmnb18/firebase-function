import { adminRef, db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";
import { generateRedeemCode } from "../../utils/helper";

interface RedeemTodayOfferInput {
    seller_id: string;
}

interface RedeemTodayOfferOutput {
    success: boolean;
    redeem_code: string;
    status: string;
    offer: {
        title: string;
        min_spend: number;
        terms: string;
    };
}

export const redeemTodayOffer = createCallableFunction<RedeemTodayOfferInput, RedeemTodayOfferOutput>(
    async (data, auth, context) => {
        try {
            if (!auth?.uid) {
                throw new Error("Unauthorized");
            }

            const { seller_id } = data;
            if (!seller_id) {
                throw new Error("seller_id required");
            }

            const user_id = auth!.uid;
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

            return {
                success: true,
                ...responsePayload,
            };
        } catch (err: any) {
            console.error("redeemTodayOffer error:", err);
            throw err;
        }
    },
    {
        region: "asia-south1",
        requireAuth: true
    }
);