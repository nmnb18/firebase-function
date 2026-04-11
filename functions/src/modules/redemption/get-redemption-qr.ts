// firebase-functions/src/redemption/getRedemptionQR.ts
import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { generateQRBase64 } from "../../utils/qr-helper";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const getRedemptionQRHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
            const currentUser = await authenticateUser(req.headers.authorization);

            const { redemption_id } = req.query;

            if (!redemption_id) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "redemption_id is required", HttpStatus.BAD_REQUEST);
            }

            // Find redemption by redemption_id (not document ID)
            const redemptionsQuery = await db.collection("redemptions")
                .where("redemption_id", "==", redemption_id)
                .limit(1)
                .get();

            if (redemptionsQuery.empty) {
                return sendError(res, ErrorCodes.NOT_FOUND, "Redemption not found", HttpStatus.NOT_FOUND);
            }

            const redemptionDoc = redemptionsQuery.docs[0];
            const redemptionData = redemptionDoc.data();

            // Verify the redemption belongs to the current user
            if (redemptionData.user_id !== currentUser.uid) {
                return sendError(res, ErrorCodes.FORBIDDEN, "Not authorized to view this redemption", HttpStatus.FORBIDDEN);
            }
            const qrBase64 = await generateQRBase64(redemptionData.qr_data);
            // Return only QR-related data
            return sendSuccess(res, {
                redemption_id: redemptionData.redemption_id,
                qr_code_base64: qrBase64,
                qr_data: redemptionData.qr_data,
                status: redemptionData.status,
                expires_at: redemptionData.expires_at?.toDate?.() || redemptionData.expires_at,
                seller_shop_name: redemptionData.seller_shop_name,
                points: redemptionData.points
            }, HttpStatus.OK);

    } catch (err) {
        next(err);
    }
};