import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

export const getSellerRedeemedPerks = createCallableFunction<void, any>(
  async (_, auth) => {
    const sellerId = auth!.uid;

    // Fetch seller's claims
    const claimsSnap = await db
      .collection("today_offer_claims")
      .where("seller_id", "==", sellerId)
      .orderBy("created_at", "desc")
      .get();

    // Normalize response
    const perks = claimsSnap.docs.map((doc) => {
      const claim = doc.data();
      return {
        id: doc.id,
        seller_id: claim.seller_id,
        shop_name: claim.shop_name,
        shop_logo_url: claim.seller_logo,
        customer_name: claim.customer_name,
        customer_contact: claim.customer_contact,
        offer_id: claim.offer_id,
        offer_title: claim.title,
        min_spend: claim.min_spend,
        terms: claim.terms,
        date: claim.date,
        expiry_date: `${claim.date}T23:59:59`, // EOD expiry
        status: claim?.status || "CLAIMED",
        redeem_code: claim?.redeem_code || null,
        redeemed_at: claim?.created_at || null,
      };
    });

    return {
      success: true,
      count: perks.length,
      perks,
    };
  },
  { region: "asia-south1", requireAuth: true }
);
