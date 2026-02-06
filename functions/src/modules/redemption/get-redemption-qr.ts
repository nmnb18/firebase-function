import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";
import { generateQRBase64 } from "../../utils/qr-helper";

interface GetRedemptionQRRequest {
  redemption_id: string;
}

export const getRedemptionQR = createCallableFunction<
  GetRedemptionQRRequest,
  any
>(
  async (data, auth) => {
    const { redemption_id } = data;

    if (!redemption_id) {
      throw new Error("redemption_id is required");
    }

    // Find redemption by redemption_id (not document ID)
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

    // Verify the redemption belongs to the current user
    if (redemptionData.user_id !== auth!.uid) {
      throw new Error("Not authorized to view this redemption");
    }

    const qrBase64 = await generateQRBase64(redemptionData.qr_data);

    // Return only QR-related data
    return {
      success: true,
      redemption_id: redemptionData.redemption_id,
      qr_code_base64: qrBase64,
      qr_data: redemptionData.qr_data,
      status: redemptionData.status,
      expires_at:
        redemptionData.expires_at?.toDate?.() || redemptionData.expires_at,
      seller_shop_name: redemptionData.seller_shop_name,
      points: redemptionData.points,
    };
  },
  { region: "asia-south1", requireAuth: true }
);