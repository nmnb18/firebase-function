import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

export const findSellerByUPI = createCallableFunction<
  { upiId: string },
  any
>(
  async (data) => {
    const { upiId } = data;

    if (!upiId) {
      throw new Error("UPI ID is required");
    }

    // Find seller by UPI ID
    const sellersSnapshot = await db
      .collection("seller_profiles")
      .where("rewards.upi_ids", "array-contains", upiId)
      .limit(1)
      .get();

    if (sellersSnapshot.empty) {
      throw new Error("Seller not found for this UPI ID");
    }

    const sellerDoc = sellersSnapshot.docs[0];
    const seller = sellerDoc.data();

    // Return seller info (excluding sensitive data)
    return {
      success: true,
      seller: {
        id: sellerDoc.id,
        shop_name: seller.shop_name,
        business_type: seller.business_type,
        category: seller.category,
        upi_ids: seller.upi_ids,
        rewards: seller.rewards || {},
        location: seller.location || {}
      }
    };
  },
  { region: "asia-south1", requireAuth: true }
);