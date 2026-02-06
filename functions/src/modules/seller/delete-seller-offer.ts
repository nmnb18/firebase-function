import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

export const deleteSellerOffer = createCallableFunction<
  { date: string },
  { success: boolean }
>(
  async (data, auth) => {
    const { date } = data;

    if (!date) {
      throw new Error("date required");
    }

    const today = new Date().toISOString().split("T")[0];

    if (date <= today) {
      throw new Error("You can only delete upcoming offers");
    }

    const seller_id = auth!.uid;
    const docId = `${seller_id}_${date}`;
    
    await db.collection("seller_daily_offers").doc(docId).delete();

    return { success: true };
  },
  { region: "asia-south1", requireAuth: true }
);
