import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { createCache } from "../../utils/cache";

const corsHandler = cors({ origin: true });
const cache = createCache();

export const deleteSellerOffer = functions.https.onRequest(
    { region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "DELETE")
                    return res.status(405).json({ error: "DELETE only" });

                // authenticate
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid)
                    return res.status(401).json({ error: "Unauthorized" });

                const { date } = req.query;
                const seller_id = currentUser.uid;

                if (!date)
                    return res.status(400).json({ error: "date required" });

                const today = new Date().toISOString().split("T")[0];

                if (date <= today)
                    return res.status(403).json({
                        error: "You can only delete upcoming offers",
                    });

                const docId = `${seller_id}_${date}`;
                await db.collection("seller_daily_offers").doc(docId).delete();
                const cacheKey = `seller_offers:${seller_id}`;
                cache.delete(cacheKey);
                return res.status(200).json({ success: true });
            } catch (err: any) {
                console.error("deleteSellerOffer error:", err);
                return res.status(500).json({ error: err.message });
            }
        });
    });
