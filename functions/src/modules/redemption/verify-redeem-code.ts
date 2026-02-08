import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import admin from "firebase-admin";

const corsHandler = cors({ origin: true });

export const verifyRedeemCode = functions.https.onRequest(
    { region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") {
                    return res.status(405).json({ error: "POST only" });
                }

                // 🔐 Seller authentication
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                const seller_id = currentUser.uid;
                const { redeem_code } = req.body;

                if (!redeem_code) {
                    return res.status(400).json({ error: "redeem_code required" });
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

                return res.status(200).json(resultPayload);
            } catch (err: any) {
                console.error("verifyRedeemCode error:", err);
                return res.status(400).json({ error: err.message });
            }
        });
    });
