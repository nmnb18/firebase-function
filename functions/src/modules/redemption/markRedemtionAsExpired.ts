import { Request, Response, NextFunction } from "express";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { Redemption } from "../../types/redemption";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const markRedemptionAsExpiredHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

                const { redemption_id } = req.body;

                if (!redemption_id) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "redemption_id is required", HttpStatus.BAD_REQUEST);
                }

                // 1. Verify seller owns this redemption
                const redemptionRef = db.collection("redemptions").doc(redemption_id);
                const redemptionDoc = await redemptionRef.get();

                if (!redemptionDoc.exists) {
                    return sendError(res, ErrorCodes.NOT_FOUND, "Redemption not found", HttpStatus.NOT_FOUND);
                }

                const redemption = redemptionDoc.data() as Redemption;

                await redemptionRef.update({
                    status: "expired",
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        ...redemption.metadata,
                        seller_notes: "QR expired"
                    }
                });

                // Release point hold
                await releasePointHold(redemption_id);

                return sendSuccess(res, {}, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};

async function releasePointHold(redemptionId: string) {
    const holdsQuery = await db.collection("point_holds")
        .where("redemption_id", "==", redemptionId)
        .where("status", "==", "reserved")
        .limit(1)
        .get();

    if (!holdsQuery.empty) {
        await holdsQuery.docs[0].ref.update({
            status: "released",
            released_at: adminRef.firestore.FieldValue.serverTimestamp()
        });
    }
}