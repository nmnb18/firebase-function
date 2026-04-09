import { Request, Response } from "express";
import cors from "cors";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const registerPushTokenHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            try {
                const user = await authenticateUser(req.headers.authorization); // gives user.uid

                const {
                    push_token,
                    platform,
                    device_name,
                    device_model,
                } = req.body;

                if (!push_token) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Push token missing", HttpStatus.BAD_REQUEST);
                }

                // Avoid duplicates
                const existing = await db
                    .collection("push_tokens")
                    .where("user_id", "==", user.uid)
                    .where("token", "==", push_token)
                    .get();

                if (!existing.empty) {
                    return sendSuccess(res, { message: "Token already registered" }, HttpStatus.OK);
                }

                await db.collection("push_tokens").add({
                    user_id: user.uid,
                    token: push_token,
                    platform,
                    device_name,
                    device_model,
                    created_at: new Date(),
                    updated_at: new Date(),
                });

                return sendSuccess(res, { message: "Push token registered" }, HttpStatus.OK);
            } catch (err) {
                console.error(err);
                return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
            }
        });
};
