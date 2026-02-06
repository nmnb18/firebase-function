import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

interface GetRedemptionStatusRequest {
  redemption_id: string;
}

export const getRedemptionStatus = createCallableFunction<
  GetRedemptionStatusRequest,
  any
>(
  async (data, auth) => {
    const { redemption_id } = data;

    if (!redemption_id) {
      throw new Error("redemption_id is required");
    }

    // Find redemption by redemption_id (same pattern you use)
    const redemptionsQuery = await db
      .collection("redemptions")
      .where("redemption_id", "==", redemption_id)
      .limit(1)
      .get();

    if (redemptionsQuery.empty) {
      throw new Error("Redemption not found");
    }

    const redemptionDoc = redemptionsQuery.docs[0];
    const redemptionData = redemptionDoc.data();

    // Ownership check (same as your QR function)
    if (redemptionData.user_id !== auth!.uid) {
      throw new Error("Not authorized to view this redemption");
    }

    // Return full updated redemption object for polling
    return {
      success: true,
      redemption: {
        ...redemptionData,
        redemption_id: redemptionData.redemption_id,
        created_at:
          redemptionData.created_at?.toDate?.() || redemptionData.created_at,
        redeemed_at:
          redemptionData.redeemed_at?.toDate?.() || redemptionData.redeemed_at,
        expires_at:
          redemptionData.expires_at?.toDate?.() || redemptionData.expires_at,
      },
    };
  },
  { region: "asia-south1", requireAuth: true }
);
