import { Request, Response } from "express";
import cors from "cors";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const getSubscriptionHistoryHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
        if (req.method !== "GET") {
            return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Only GET allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }

        try {
            // Authenticate user
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser || !currentUser.uid) {
                return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
            }

            const { sellerId } = req.query;

            if (!sellerId) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Seller ID is required", HttpStatus.BAD_REQUEST);
            }

            // Verify the sellerId matches the authenticated user
            if (sellerId !== currentUser.uid) {
                return sendError(res, ErrorCodes.FORBIDDEN, "Access denied", HttpStatus.FORBIDDEN);
            }

            // Get subscription history from Firestore
            const historySnapshot = await db
                .collection("subscription_history")
                .doc(sellerId as string)
                .collection("records")
                .orderBy("paid_at", "desc")
                .get();

            if (historySnapshot.empty) {
                return sendSuccess(res, { history: [], message: "No subscription history found" }, HttpStatus.OK);
            }

            const history = historySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return sendSuccess(res, { history, total: history.length }, HttpStatus.OK);

        } catch (error: any) {
            console.error("Get subscription history error:", error);
            return sendError(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch subscription history", error.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
        }
    });
};