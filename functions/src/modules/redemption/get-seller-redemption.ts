import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { createCache } from "../../utils/cache";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const cache = createCache();

export const getSellerRedemptionsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const sellerUser = await authenticateUser(req.headers.authorization);

        // Get query parameters
        const { status, limit = 50, offset = 0 } = req.query;
        // const cacheKey = `seller_redemptions:${sellerUser.uid}_${status || 'all'}_${limit}_${offset}`;
        // const cached = cache.get<any>(cacheKey);
        // if (cached) {
        //     return res.status(200).json(cached);
        // }
        // Build query
        let query: any = db.collection("redemptions")
            .where("seller_id", "==", sellerUser.uid)
            .orderBy("created_at", "desc");
        if (status) {
            query = query.where("status", "==", status);
        }
        // Parallelize main query and counts
        const [snapshot, pendingCountSnap, totalCountSnap] = await Promise.all([
            query.limit(parseInt(limit as string)).offset(parseInt(offset as string)).get(),
            db.collection("redemptions").where("seller_id", "==", sellerUser.uid).where("status", "==", "pending").count().get(),
            db.collection("redemptions").where("seller_id", "==", sellerUser.uid).count().get(),
        ]);
        const redemptions = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data(),
            created_at: doc.data().created_at?.toDate?.() || doc.data().created_at,
            expires_at: doc.data().expires_at?.toDate?.() || doc.data().expires_at,
            redeemed_at: doc.data().redeemed_at?.toDate?.() || doc.data().redeemed_at
        }));
        const responseData = {
            success: true,
            redemptions,
            stats: {
                pending: pendingCountSnap.data().count,
                total: totalCountSnap.data().count,
            },
        };
        //cache.set(cacheKey, responseData, 30000);
        return sendSuccess(res, responseData, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};