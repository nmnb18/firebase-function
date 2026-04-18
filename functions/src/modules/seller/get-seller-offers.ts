import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { createCache } from "../../utils/cache";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const cache = createCache();

export const getSellerOffersHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid)
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);

                const seller_id = currentUser.uid;
                const today = new Date().toISOString().slice(0, 10);
                const requestedDate = req.query.date as string | undefined;
                // Caching for grouped offers (not for single day edit)
                // const cacheKey = `seller_offers:${seller_id}`;
                // if (!requestedDate) {
                //     const cached = cache.get<any>(cacheKey);
                //     if (cached) {
                //         return res.status(200).json(cached);
                //     }
                // }
                // MODE A: Fetch a single day's offer (used for EDIT)
                if (requestedDate) {
                    const docId = `${seller_id}_${requestedDate}`;
                    const doc = await db.collection("seller_daily_offers").doc(docId).get();
                    if (!doc.exists)
                        return sendError(res, ErrorCodes.NOT_FOUND, "Offer not found for date", HttpStatus.NOT_FOUND);
                    return sendSuccess(res, { offer: { id: doc.id, ...doc.data() } }, HttpStatus.OK);
                }
                // MODE B: Fetch grouped offers (parallel)
                const [activeSnap, upcomingSnap, expiredSnap] = await Promise.all([
                    db.collection("seller_daily_offers")
                        .where("seller_id", "==", seller_id)
                        .where("date", "==", today)
                        .where("status", "==", 'Active')
                        .get(),
                    db.collection("seller_daily_offers")
                        .where("seller_id", "==", seller_id)
                        .where("date", ">", today)
                        .orderBy("date", "asc")
                        .get(),
                    db.collection("seller_daily_offers")
                        .where("seller_id", "==", seller_id)
                        .where("date", "<", today)
                        .orderBy("date", "desc")
                        .get(),
                ]);
                const responseData = {
                    success: true,
                    today,
                    active: activeSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
                    upcoming: upcomingSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
                    expired: expiredSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
                };
                //cache.set(cacheKey, responseData, 60000);
                return sendSuccess(res, { today, active: activeSnap.docs.map((d) => ({ id: d.id, ...d.data() })), upcoming: upcomingSnap.docs.map((d) => ({ id: d.id, ...d.data() })), expired: expiredSnap.docs.map((d) => ({ id: d.id, ...d.data() })) }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
