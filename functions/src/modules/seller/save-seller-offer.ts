import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface SaveSellerOfferRequest {
  date?: string;
  start_date?: string;
  end_date?: string;
  offers: Array<{ id: string; title: string; min_spend: number; terms: string }>;
}

export const saveSellerOffer = createCallableFunction<
  SaveSellerOfferRequest,
  { success: boolean; dates_saved: number }
>(
  async (data, auth) => {
    const { date, start_date, end_date, offers } = data;
    const seller_id = auth!.uid;

    if (!Array.isArray(offers)) {
      throw new Error("Offers required");
    }

    if (offers.length < 2 || offers.length > 15) {
      throw new Error("Offers must be between 2–15 items");
    }

    // Resolve dates
    let dates: string[] = [];

    if (date) {
      if (!DATE_REGEX.test(date)) {
        throw new Error("Invalid date format (YYYY-MM-DD)");
      }
      dates = [date];
    } else if (start_date && end_date) {
      if (!DATE_REGEX.test(start_date) || !DATE_REGEX.test(end_date)) {
        throw new Error("Invalid date format (YYYY-MM-DD)");
      }

      if (start_date > end_date) {
        throw new Error("start_date cannot be after end_date");
      }

      let current = new Date(start_date);
      const end = new Date(end_date);

      while (current <= end) {
        dates.push(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
      }
    } else {
      throw new Error("Provide either date or start_date & end_date");
    }

    const today = new Date().toISOString().slice(0, 10);

    if (dates.some((d) => d <= today)) {
      throw new Error("Cannot modify active or past dates");
    }

    // Normalize offers
    const formattedOffers = offers.map((o: any) => ({
      id: o.id?.toString(),
      title: o.title?.trim(),
      min_spend: Number(o.min_spend),
      terms: o.terms?.trim(),
    }));

    // Batch write
    const batch = db.batch();

    dates.forEach((d) => {
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

    return {
      success: true,
      dates_saved: dates.length,
    };
  },
  { region: "asia-south1", requireAuth: true }
);
