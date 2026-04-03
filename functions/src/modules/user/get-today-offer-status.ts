import { Request, Response } from "express";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";


const corsHandler = cors({ origin: true });

export const getTodayOfferStatusHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
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

            return sendSuccess(res, {
                claimed: snap.exists,
                status: snap.exists ? snap.data()?.status : null,
                redeem_code: snap.exists ? snap.data()?.redeem_code : null
            }, HttpStatus.OK);
        } catch (err: any) {
            return sendError(res, ErrorCodes.INTERNAL_ERROR, err.message, err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
        }
    });
};
