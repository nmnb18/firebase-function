import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const saveSellerOffer = functions.https.onRequest(
    { region: "asia-south1", timeoutSeconds: 30, memory: '256MiB' },
    (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST")
                    return res.status(405).json({ error: "POST only" });

                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid)
                    return res.status(401).json({ error: "Unauthorized" });

                const { date, start_date, end_date, offers } = req.body;
                const seller_id = currentUser.uid;

                if (!Array.isArray(offers))
                    return res.status(400).json({ error: "Offers required" });

                if (offers.length < 2 || offers.length > 15)
                    return res.status(400).json({ error: "Offers must be between 2–15 items" });

                // ---- Resolve dates ----
                let dates: string[] = [];

                if (date) {
                    if (!DATE_REGEX.test(date))
                        return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD)" });
                    dates = [date];
                } else if (start_date && end_date) {
                    if (!DATE_REGEX.test(start_date) || !DATE_REGEX.test(end_date))
                        return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD)" });

                    if (start_date > end_date)
                        return res.status(400).json({ error: "start_date cannot be after end_date" });

                    let current = new Date(start_date);
                    const end = new Date(end_date);

                    while (current <= end) {
                        dates.push(current.toISOString().slice(0, 10));
                        current.setDate(current.getDate() + 1);
                    }
                } else {
                    return res.status(400).json({
                        error: "Provide either date or start_date & end_date"
                    });
                }

                const today = new Date().toISOString().slice(0, 10);

                if (dates.some(d => d <= today))
                    return res.status(403).json({
                        error: "Cannot modify active or past dates"
                    });

                // ---- Normalize offers ----
                const formattedOffers = offers.map((o: any) => ({
                    id: o.id?.toString(),
                    title: o.title?.trim(),
                    min_spend: Number(o.min_spend),
                    terms: o.terms?.trim(),
                }));

                // ---- Batch write (important for range) ----
                const batch = db.batch();

                dates.forEach(d => {
                    const docId = `${seller_id}_${d}`;
                    const ref = db.collection("seller_daily_offers").doc(docId);

                    batch.set(
                        ref,
                        {
                            seller_id,
                            date: d,
                            offers: formattedOffers,
                            status: "Pending",
                            updated_at: new Date(),
                            created_at: new Date(),
                        },
                        { merge: true }
                    );
                });

                await batch.commit();

                return res.status(200).json({
                    success: true,
                    dates_saved: dates.length
                });
            } catch (err: any) {
                console.error("saveSellerOffer error:", err);
                return res.status(500).json({ error: err.message });
            }
        });
    }
);
