import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const getTodayOfferStatusHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
            }

            const { seller_id } = req.query;
            const today = new Date().toISOString().slice(0, 10);
            const claimId = `${currentUser.uid}_${seller_id}_${today}`;

            const snap = await db
                .collection("today_offer_claims")
                .doc(claimId)
                .get();

            const snapData = snap.data();
            return sendSuccess(res, {
                claimed: snap.exists,
                status: snap.exists ? snapData?.status : null,
                redeem_code: snap.exists ? snapData?.redeem_code : null,
                // Return offer details so UI can restore the revealed state for ASSIGNED offers
                offer: snap.exists && snapData?.status === 'ASSIGNED' ? {
                    title: snapData?.title,
                    min_spend: snapData?.min_spend,
                    terms: snapData?.terms,
                } : null,
            }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
