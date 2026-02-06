import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

interface GetSellerRedemptionsRequest {
  status?: string;
  limit?: number;
  offset?: number;
}

export const getSellerRedemptions = createCallableFunction<
  GetSellerRedemptionsRequest,
  any
>(
  async (data, auth) => {
    const sellerId = auth!.uid;
    const { status, limit = 50, offset = 0 } = data || {};

    // Build query
    let query: any = db
      .collection("redemptions")
      .where("seller_id", "==", sellerId)
      .orderBy("created_at", "desc");

    // Add status filter
    if (status) {
      query = query.where("status", "==", status);
    }

    // Execute query with pagination
    const snapshot = await query
      .limit(parseInt(limit as any))
      .offset(parseInt(offset as any))
      .get();

    const redemptions = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
      created_at: doc.data().created_at?.toDate?.() || doc.data().created_at,
      expires_at: doc.data().expires_at?.toDate?.() || doc.data().expires_at,
      redeemed_at: doc.data().redeemed_at?.toDate?.() || doc.data().redeemed_at,
    }));

    // Get counts in parallel
    const [pendingCountSnap, totalCountSnap] = await Promise.all([
      db
        .collection("redemptions")
        .where("seller_id", "==", sellerId)
        .where("status", "==", "pending")
        .count()
        .get(),
      db
        .collection("redemptions")
        .where("seller_id", "==", sellerId)
        .count()
        .get(),
    ]);

    return {
      success: true,
      redemptions: redemptions,
      stats: {
        pending: pendingCountSnap.data().count,
        total: totalCountSnap.data().count,
      },
    };
  },
  { region: "asia-south1", requireAuth: true }
);