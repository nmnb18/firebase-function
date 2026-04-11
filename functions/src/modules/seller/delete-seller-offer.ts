import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { createCache } from "../../utils/cache";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const cache = createCache();

export const deleteSellerOfferHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

                // authenticate
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid)
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);

                const { date } = req.query;
                const seller_id = currentUser.uid;

                if (!date)
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "date required", HttpStatus.BAD_REQUEST);

                const today = new Date().toISOString().split("T")[0];

                if (date <= today)
                    return sendError(res, ErrorCodes.FORBIDDEN, "You can only delete upcoming offers", HttpStatus.FORBIDDEN);

                const docId = `${seller_id}_${date}`;
                await db.collection("seller_daily_offers").doc(docId).delete();
                const cacheKey = `seller_offers:${seller_id}`;
                cache.delete(cacheKey);
                return sendSuccess(res, {}, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
