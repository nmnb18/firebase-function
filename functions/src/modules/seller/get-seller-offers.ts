import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

interface GetSellerOffersRequest {
    date?: string;
}

export const getSellerOffers = createCallableFunction<
    GetSellerOffersRequest,
    any
>(
    async (data, auth) => {
        const seller_id = auth!.uid;
        const today = new Date().toISOString().slice(0, 10);
        const requestedDate = data.date;

        // 1️⃣ MODE A: Fetch a single day's offer (used for EDIT)
        if (requestedDate) {
            const docId = `${seller_id}_${requestedDate}`;
            const doc = await db.collection("seller_daily_offers").doc(docId).get();

            if (!doc.exists) {
                throw new Error("Offer not found for date");
            }

            return {
                success: true,
                offer: { id: doc.id, ...doc.data() },
            };
        }

        // 2️⃣ MODE B: Fetch grouped offers (PARALLEL)
        const [activeSnap, upcomingSnap, expiredSnap] = await Promise.all([
            db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", "==", today)
                .where("status", "==", "Active")
                .orderBy("date", "desc")
                .get(),
            db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", ">", today)
                .orderBy("date", "asc")
                .get(),
            db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", "<", today)
                .orderBy("date", "desc")
                .get(),
        ]);

        return {
            success: true,
            today,
            active: activeSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            upcoming: upcomingSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            expired: expiredSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        };
    },
    { region: "asia-south1", requireAuth: true }
);

