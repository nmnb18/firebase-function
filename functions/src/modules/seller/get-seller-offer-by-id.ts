import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

export const getSellerOfferById = createCallableFunction<
  { seller_id?: string },
  any
>(
  async (data) => {
    const { seller_id } = data;
    const today = new Date().toISOString().slice(0, 10);

    // Fetch grouped offers (PARALLEL)
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

