import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const getSellerRedeemedPerks = functions.https.onRequest({ region: "asia-south1", }, (req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "GET") {
                return res.status(405).json({ error: "GET only" });
            }

            // 🔐 AUTH
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return res.status(401).json({ error: "Unauthorized" });
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

            return res.status(200).json({
                success: true,
                count: perks.length,
                perks,
            });

        } catch (err: any) {
            console.error("getSellerPerks error:", err);
            return res.status(500).json({ error: err.message });
        }
    });
});
