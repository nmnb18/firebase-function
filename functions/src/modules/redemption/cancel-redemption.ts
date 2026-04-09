import { Request, Response } from "express";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { Redemption } from "../../types/redemption";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const cancelRedemptionHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
            }

            try {
                const currentUser = await authenticateUser(req.headers.authorization);
                const { redemption_id } = req.body;

                if (!redemption_id) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "redemption_id is required", HttpStatus.BAD_REQUEST);
                }

                // Get redemption
                const redemptionRef = db.collection("redemptions").doc(redemption_id);
                const redemptionDoc = await redemptionRef.get();

                if (!redemptionDoc.exists) {
                    return sendError(res, ErrorCodes.NOT_FOUND, "Redemption not found", HttpStatus.NOT_FOUND);
                }

                const redemption = redemptionDoc.data() as Redemption;

                // Check authorization (only user who created it can cancel)
                if (redemption.user_id !== currentUser.uid) {
                    return sendError(res, ErrorCodes.FORBIDDEN, "Not authorized to cancel this redemption", HttpStatus.FORBIDDEN);
                }

                // Check if already processed
                if (redemption.status !== "pending") {
                    return sendError(res, ErrorCodes.REDEMPTION_ALREADY_PROCESSED, `Cannot cancel - redemption already ${redemption.status}`, HttpStatus.CONFLICT);
                }

                // Update status
                await redemptionRef.update({
                    status: "cancelled",
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp()
                });

                // Release point hold
                await releasePointHold(redemption_id);

                return sendSuccess(res, { message: "Redemption cancelled successfully", redemption_id }, HttpStatus.OK);

            } catch (error: any) {
                console.error("Cancel redemption error:", error);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, error.message, error.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
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