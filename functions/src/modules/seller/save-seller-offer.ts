import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const saveSellerOffer = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "POST")
                return res.status(405).json({ error: "POST only" });

            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid)
                return res.status(401).json({ error: "Unauthorized" });

            const { date, offers } = req.body;
            const seller_id = currentUser.uid;

            if (!date || !Array.isArray(offers))
                return res.status(400).json({ error: "Date & Offers required" });

            if (offers.length < 2 || offers.length > 15)
                return res.status(400).json({ error: "Offers must be between 5–15 items" });

            // Validate date formatting
            const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
            if (!DATE_REGEX.test(date))
                return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)" });

            const today = new Date().toISOString().slice(0, 10); // UTC-safe

            if (date <= today)
                return res.status(403).json({ error: "Cannot modify active or expired offer dates" });

            // Normalize offers
            const formattedOffers = offers.map((o: any) => ({
                id: o.id?.toString(),
                title: o.title?.trim(),
                min_spend: Number(o.min_spend),
                terms: o.terms?.trim(),
            }));

            const docId = `${seller_id}_${date}`;

            await db.collection("seller_daily_offers").doc(docId).set(
                {
                    seller_id,
                    date,
                    offers: formattedOffers,
                    updated_at: new Date(),
                    created_at: new Date(),
                    status: 'Pending'
                },
                { merge: true }
            );

            return res.status(200).json({ success: true });
        } catch (err: any) {
            console.error("saveSellerOffer error:", err);
            return res.status(500).json({ error: err.message });
        }
    });
});
