import { Request, Response } from "express";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const getRedemptionStatusHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            if (req.method !== "GET") {
                return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
            }

            try {
                // ✅ AUTH
                const currentUser = await authenticateUser(req.headers.authorization);

                const { redemption_id } = req.query;
                if (!redemption_id) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "redemption_id is required", HttpStatus.BAD_REQUEST);
                }

                // ✅ Find redemption by redemption_id
                const redemptionsQuery = await db.collection("redemptions")
                    .where("redemption_id", "==", redemption_id)
                    .limit(1)
                    .get();

                if (redemptionsQuery.empty) {
                    return sendError(res, ErrorCodes.NOT_FOUND, "Redemption not found", HttpStatus.NOT_FOUND);
                }

                const redemptionDoc = redemptionsQuery.docs[0];
                let redemptionData = redemptionDoc.data();

                // ✅ Ownership check
                if (redemptionData.user_id !== currentUser.uid) {
                    return sendError(res, ErrorCodes.FORBIDDEN, "Not authorized to view this redemption", HttpStatus.FORBIDDEN);
                }

                // ✅ Auto-expire if past expires_at and still pending
                const now = Date.now();
                let expiresAtMs: number;

                if (redemptionData.expires_at?.toDate) {
                    expiresAtMs = redemptionData.expires_at.toDate().getTime();
                } else if (typeof redemptionData.expires_at === "number") {
                    expiresAtMs = redemptionData.expires_at;
                } else {
                    expiresAtMs = new Date(redemptionData.expires_at).getTime();
                }

                if (redemptionData.status === "pending" && now >= expiresAtMs) {
                    // Update Firestore to mark expired
                    await redemptionDoc.ref.update({ status: "expired" });
                    await releasePointHold(redemption_id as string);
                    redemptionData.status = "expired";
                }

                // ✅ Return updated redemption object
                return sendSuccess(res, {
                    redemption: {
                        ...redemptionData,
                        redemption_id: redemptionData.redemption_id,
                        created_at: redemptionData.created_at?.toDate?.() || redemptionData.created_at,
                        redeemed_at: redemptionData.redeemed_at?.toDate?.() || redemptionData.redeemed_at,
                        expires_at: redemptionData.expires_at?.toDate?.() || redemptionData.expires_at,
                    }
                }, HttpStatus.OK);

            } catch (error: any) {
                console.error("Get redemption status error:", error);
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