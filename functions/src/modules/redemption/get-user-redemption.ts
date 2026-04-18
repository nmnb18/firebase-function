// firebase-functions/src/redemption/getUserRedemptions.ts
import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { createCache } from "../../utils/cache";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const cache = createCache();

export const getUserRedemptionsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
                const currentUser = await authenticateUser(req.headers.authorization);
                // Get query parameters
                const { seller_id } = req.query;
                const { limit: limitParam, start_after } = req.query as Record<string, string>;
                const pageSize = Math.min(parseInt(limitParam) || 20, 50);

                let query: any = db.collection("redemptions")
                    .where("user_id", "==", currentUser.uid)
                    .orderBy("created_at", "desc")
                    .limit(pageSize);

                if (seller_id) {
                    query = query.where("seller_id", "==", seller_id);
                }

                // Cursor-based pagination: pass the last doc's redemption_id as start_after
                if (start_after) {
                    const cursorDoc = await db.collection("redemptions").doc(start_after as string).get();
                    if (cursorDoc.exists) {
                        query = query.startAfter(cursorDoc);
                    }
                }

                const snapshot = await query.get();
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
                        metadata: data.metadata || {}
                    };
                });
                const stats = {
                    total: redemptions.length,
                    pending: redemptions.filter((r: { status: string; }) => r.status === 'pending').length,
                    redeemed: redemptions.filter((r: { status: string; }) => r.status === 'redeemed').length,
                    cancelled: redemptions.filter((r: { status: string; }) => r.status === 'cancelled').length,
                    expired: redemptions.filter((r: { status: string; }) => r.status === 'expired').length,
                    total_points: redemptions.reduce((sum: any, r: { points: any; }) => sum + (r.points || 0), 0),
                    redeemed_points: redemptions
                        .filter((r: { status: string; }) => r.status === 'redeemed')
                        .reduce((sum: any, r: { points: any; }) => sum + (r.points || 0), 0),
                    pending_points: redemptions
                        .filter((r: { status: string; }) => r.status === 'pending')
                        .reduce((sum: any, r: { points: any; }) => sum + (r.points || 0), 0),
                };
                const lastDoc = snapshot.docs[snapshot.docs.length - 1];
                const next_cursor = snapshot.docs.length === pageSize
                    ? (lastDoc?.data()?.redemption_id || lastDoc?.id)
                    : null;

                const responseData = { redemptions, count: redemptions.length, stats, next_cursor };
                //cache.set(cacheKey, responseData, 30000);
                return sendSuccess(res, responseData, HttpStatus.OK);

    } catch (error: any) {
        if (error.code === 9) { // FAILED_PRECONDITION error
            return sendError(res, ErrorCodes.INTERNAL_ERROR, "Database query requires index. Please contact support.", HttpStatus.BAD_REQUEST);
        }
        next(error);
    }
};
