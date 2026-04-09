import { Request, Response } from "express";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const getSellerOfferByIdHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "GET")
                return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "GET only", HttpStatus.METHOD_NOT_ALLOWED);

            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid)
                return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);

            const { seller_id } = req.query;
            const today = new Date().toISOString().slice(0, 10);

            // -----------------------------------------------------
            // 2️⃣ MODE B: Fetch grouped offers
            // -----------------------------------------------------
            const activePromise = db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", "==", today)
                .where("status", "==", 'Active')
                .orderBy("date", "desc")
                .get();

            const upcomingPromise = db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", ">", today)
                .orderBy("date", "asc")
                .get();

            const expiredPromise = db
                .collection("seller_daily_offers")
                .where("seller_id", "==", seller_id)
                .where("date", "<", today)
                .orderBy("date", "desc")
                .get();

            const [activeSnap, upcomingSnap, expiredSnap] = await Promise.all([
                activePromise,
                upcomingPromise,
                expiredPromise,
            ]);

            return sendSuccess(res, {
                today,
                active: activeSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
                upcoming: upcomingSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
                expired: expiredSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            }, HttpStatus.OK);
        } catch (err: any) {
            console.error("getSellerOffers error:", err);
            return sendError(res, ErrorCodes.INTERNAL_ERROR, err.message, err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
        }
    });
};

