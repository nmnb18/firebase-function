import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

interface GetUserRedemptionsRequest {
    seller_id?: string;
}

export const getUserRedemptions = createCallableFunction<
    GetUserRedemptionsRequest,
    any
>(
    async (data, auth) => {
        const userId = auth!.uid;
        const { seller_id } = data || {};

        // Build base query
        let query: any = db
            .collection("redemptions")
            .where("user_id", "==", userId)
            .orderBy("created_at", "desc");

        // Add seller filter if provided
        if (seller_id) {
            query = query.where("seller_id", "==", seller_id);
        }

        // Execute query
        const snapshot = await query.get();

        // Transform documents
        const redemptions = snapshot.docs.map((doc: any) => {
            const data = doc.data();

            return {
                id: doc.id,
                redemption_id: data.redemption_id,
                seller_id: data.seller_id,
                seller_name: data.seller_name,
                seller_shop_name: data.seller_shop_name,
                user_id: data.user_id,
                points: data.points,
                status: data.status,
                offer_id: data.offer_id,
                offer_name: data.offer_name,
                qr_data: data.qr_data,
                qr_image_url: data.qr_image_url,
                created_at: data.created_at?.toDate?.() || data.created_at,
                updated_at: data.updated_at?.toDate?.() || data.updated_at,
                redeemed_at: data.redeemed_at?.toDate?.() || data.redeemed_at,
                expires_at: data.expires_at?.toDate?.() || data.expires_at,
                metadata: data.metadata || {},
            };
        });

        // Calculate stats
        const stats = {
            total: redemptions.length,
            pending: redemptions.filter(
                (r: { status: string }) => r.status === "pending"
            ).length,
            redeemed: redemptions.filter(
                (r: { status: string }) => r.status === "redeemed"
            ).length,
            cancelled: redemptions.filter(
                (r: { status: string }) => r.status === "cancelled"
            ).length,
            expired: redemptions.filter(
                (r: { status: string }) => r.status === "expired"
            ).length,
            total_points: redemptions.reduce(
                (sum: any, r: { points: any }) => sum + (r.points || 0),
                0
            ),
            redeemed_points: redemptions
                .filter((r: { status: string }) => r.status === "redeemed")
                .reduce((sum: any, r: { points: any }) => sum + (r.points || 0), 0),
            pending_points: redemptions
                .filter((r: { status: string }) => r.status === "pending")
                .reduce((sum: any, r: { points: any }) => sum + (r.points || 0), 0),
        };

        return {
            success: true,
            redemptions: redemptions,
            count: redemptions.length,
            stats: stats,
        };
    },
    { region: "asia-south1", requireAuth: true }
);