import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { generateRedeemCode } from "../../utils/helper";

const corsHandler = cors({ origin: true });
export const redeemTodayOffer = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "POST only" });
            }

            // 🔐 USER AUTH
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const { seller_id } = req.body;
            if (!seller_id) {
                return res.status(400).json({ error: "seller_id required" });
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

            return res.status(200).json({
                success: true,
                ...responsePayload,
            });
        } catch (err: any) {
            console.error("generateRedeemCode error:", err);
            return res.status(400).json({ error: err.message });
        }
    });
});
