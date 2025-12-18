import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const assignTodayOffer = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "POST")
                return res.status(405).json({ error: "POST only" });

            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid)
                return res.status(401).json({ error: "Unauthorized" });

            const { seller_id } = req.body;
            if (!seller_id) return res.status(400).json({ error: "seller_id required" });

            const sellerSnap = await db
                .collection("seller_profiles")
                .doc(seller_id)
                .get();

            if (!sellerSnap.exists) {
                return res.status(404).json({ error: "Seller not found" });
            }

            const seller = sellerSnap.data();

            const userSnap = await db
                .collection("customer_profiles")
                .doc(currentUser.uid)
                .get();

            if (!userSnap.exists) {
                return res.status(404).json({ error: "User not found" });
            }

            const user = sellerSnap.data();

            const today = new Date().toISOString().slice(0, 10);
            const claimId = `${currentUser.uid}_${seller_id}_${today}`;

            // Already selected → return existing
            const claimSnap = await db.collection("today_offer_claims").doc(claimId).get();
            if (claimSnap.exists) {
                return res.status(200).json({
                    success: true,
                    alreadyAssigned: true,
                    offer: claimSnap.data()
                });
            }

            // Fetch seller offers
            const doc = await db.collection("seller_daily_offers")
                .doc(`${seller_id}_${'2025-12-18'}`) //TODO
                .get();

            if (!doc.exists) {
                return res.status(404).json({ error: "No offers configured for today" });
            }

            const offers = doc.data()?.offers || [];
            if (!offers.length) return res.status(400).json({ error: "No offers available" });

            // Random secure selection
            const randomIndex = Math.floor(Math.random() * offers.length);
            const selected = offers[randomIndex];
            await db.collection("today_offer_claims").doc(claimId).set({
                offer_id: selected.id,
                title: selected.title,
                min_spend: selected.min_spend,
                terms: selected.terms,
                seller_id,
                user_id: currentUser.uid,
                date: today,
                status: 'ASSIGNED',
                redeemed: false,
                created_at: new Date(),
                shop_name: seller?.business?.shop_name || "Unknown Store",
                seller_logo: seller?.media?.logo_url || "",
                customer_name: user?.account.name,
                customer_contact: user?.account.phone
            });

            return res.status(200).json({ success: true, offer: selected });
        } catch (err: any) {
            console.error("assignTodayOffer error:", err);
            return res.status(500).json({ error: err.message });
        }
    });
});
