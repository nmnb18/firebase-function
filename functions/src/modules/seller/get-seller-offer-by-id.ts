import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const getSellerOfferById = functions.https.onRequest({ region: "asia-south1", minInstances: 1, timeoutSeconds: 30, memory: '256MiB' }, (req: any, res: any) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "GET")
                return res.status(405).json({ error: "GET only" });

            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid)
                return res.status(401).json({ error: "Unauthorized" });

            const { seller_id } = req.query;
            const today = new Date().toISOString().slice(0, 10);

            // -----------------------------------------------------
            // 2️⃣ MODE B: Fetch grouped offers
            // -----------------------------------------------------
            const activePromise = db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", "==", today)
                .where("status", "==", 'Active')
                .orderBy("date", "desc")
                .get();

            const upcomingPromise = db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", ">", today)
                .orderBy("date", "asc")
                .get();

            const expiredPromise = db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", "<", today)
                .orderBy("date", "desc")
                .get();

            const [activeSnap, upcomingSnap, expiredSnap] = await Promise.all([
                activePromise,
                upcomingPromise,
                expiredPromise,
            ]);

            return res.status(200).json({
                success: true,
                today,
                active: activeSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
                upcoming: upcomingSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
                expired: expiredSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            });
        } catch (err: any) {
            console.error("getSellerOffers error:", err);
            return res.status(500).json({ error: err.message });
        }
    });
});

