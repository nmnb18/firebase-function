import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const getSellerOffers = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "GET")
                return res.status(405).json({ error: "GET only" });

            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid)
                return res.status(401).json({ error: "Unauthorized" });

            const seller_id = currentUser.uid;
            const today = new Date().toISOString().slice(0, 10);

            // 🔥 QUERY 1 — active (only today's)
            const activePromise = db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", "==", today)
                .get();

            // 🔥 QUERY 2 — upcoming
            const upcomingPromise = db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", ">", today)
                .orderBy("date", "asc")
                .get();

            // 🔥 QUERY 3 — expired
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

            const active = activeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const upcoming = upcomingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const expired = expiredSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

            return res.status(200).json({
                success: true,
                today,
                active,
                upcoming,
                expired,
            });
        } catch (err: any) {
            console.error("getSellerOffers error:", err);
            return res.status(500).json({ error: err.message });
        }
    });
});
