import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { createCache } from "../../utils/cache";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const cache = createCache();

export const saveSellerOfferHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid)
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);

                const { date, start_date, end_date, offers } = req.body;
                const seller_id = currentUser.uid;

                if (!Array.isArray(offers))
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Offers required", HttpStatus.BAD_REQUEST);

                if (offers.length < 2 || offers.length > 15)
                    return sendError(res, ErrorCodes.INVALID_INPUT, "Offers must be between 2–15 items", HttpStatus.BAD_REQUEST);

                // ---- Resolve dates ----
                let dates: string[] = [];

                if (date) {
                    if (!DATE_REGEX.test(date))
                        return sendError(res, ErrorCodes.INVALID_INPUT, "Invalid date format (YYYY-MM-DD)", HttpStatus.BAD_REQUEST);
                    dates = [date];
                } else if (start_date && end_date) {
                    if (!DATE_REGEX.test(start_date) || !DATE_REGEX.test(end_date))
                        return sendError(res, ErrorCodes.INVALID_INPUT, "Invalid date format (YYYY-MM-DD)", HttpStatus.BAD_REQUEST);

                    if (start_date > end_date)
                        return sendError(res, ErrorCodes.INVALID_INPUT, "start_date cannot be after end_date", HttpStatus.BAD_REQUEST);

                    let current = new Date(start_date);
                    const end = new Date(end_date);

                    while (current <= end) {
                        dates.push(current.toISOString().slice(0, 10));
                        current.setDate(current.getDate() + 1);
                    }
                } else {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Provide either date or start_date & end_date", HttpStatus.BAD_REQUEST);
                }

                const today = new Date().toISOString().slice(0, 10);

                if (dates.some(d => d <= today))
                    return sendError(res, ErrorCodes.FORBIDDEN, "Cannot modify active or past dates", HttpStatus.FORBIDDEN);

                // ---- Normalize offers ----
                const formattedOffers = offers.map((o: any) => ({
                    id: o.id?.toString(),
                    title: o.title?.trim(),
                    min_spend: Number(o.min_spend),
                    terms: o.terms?.trim(),
                }));

                // ---- Batch write (important for range) ----
                const batch = db.batch();

                dates.forEach(d => {
                    const docId = `${seller_id}_${d}`;
                    const ref = db.collection("seller_daily_offers").doc(docId);

                    batch.set(
                        ref,
                        {
                            seller_id,
                            date: d,
                            offers: formattedOffers,
                            status: "Pending",
                            updated_at: new Date(),
                            created_at: new Date(),
                        },
                        { merge: true }
                    );
                });

                await batch.commit();
                const cacheKey = `seller_offers:${seller_id}`;
                cache.delete(cacheKey);
                return sendSuccess(res, { dates_saved: dates.length }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};