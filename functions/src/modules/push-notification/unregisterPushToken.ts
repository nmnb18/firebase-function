import { Request, Response } from "express";
import cors from "cors";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const unregisterPushTokenHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            try {
                const user = await authenticateUser(req.headers.authorization);
                const { push_token } = req.body;

                if (!push_token) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Token required", HttpStatus.BAD_REQUEST);
                }

                const snapshot = await db
                    .collection("push_tokens")
                    .where("user_id", "==", user.uid)
                    .where("token", "==", push_token)
                    .get();

                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();

                return sendSuccess(res, { message: "Push token unregistered" }, HttpStatus.OK);
            } catch (err) {
                return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
            }
        });
};
