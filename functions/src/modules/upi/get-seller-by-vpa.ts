import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const getSellerByVPAHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
            }

            const vpa = req.query.vpa as string;
            if (!vpa || !vpa.includes("@")) {
                return sendError(res, ErrorCodes.INVALID_INPUT, "A valid UPI VPA is required (e.g. merchant@bank)", HttpStatus.BAD_REQUEST);
            }

            const snap = await db
                .collection("seller_profiles")
                .where("rewards.upi_ids", "array-contains", vpa)
                .limit(1)
                .get();

            if (snap.empty) {
                return sendError(res, ErrorCodes.NOT_FOUND, "Seller not found on Grabbitt", HttpStatus.NOT_FOUND);
            }

            const doc = snap.docs[0];
            const data = doc.data();

            return sendSuccess(res, {
                seller_id: doc.id,
                shop_name: data.business?.shop_name || "",
                category: data.business?.category || "",
                reward_config: data.rewards || {},
            }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
