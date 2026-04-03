import { Request, Response } from "express";
import cors from "cors";
import { adminRef, auth, db } from "../../config/firebase";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const verifyEmailHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
            const { token } = req.query;

            if (!token) {
                return sendError(res, ErrorCodes.INVALID_INPUT, "Invalid token", HttpStatus.BAD_REQUEST);
            }

            const userSnap = await db
                .collection("users")
                .where("email_verification_token", "==", token)
                .limit(1)
                .get();

            if (userSnap.empty) {
                return sendError(res, ErrorCodes.INVALID_TOKEN, "Token invalid or expired", HttpStatus.BAD_REQUEST);
            }

            const userDoc = userSnap.docs[0];
            const userData = userDoc.data();

            if (userData.email_verification_expires.toDate() < new Date()) {
                return sendError(res, ErrorCodes.TOKEN_EXPIRED, "Link expired", HttpStatus.BAD_REQUEST);
            }

            await userDoc.ref.update({
                email_verified: true,
                email_verification_token: adminRef.firestore.FieldValue.delete(),
                email_verification_expires: adminRef.firestore.FieldValue.delete(),
                updatedAt: adminRef.firestore.FieldValue.serverTimestamp(),
            });

            // OPTIONAL: sync Firebase Auth
            await auth.updateUser(userDoc.id, {
                emailVerified: true,
            });

            return sendSuccess(res, { message: "Email verified successfully" }, HttpStatus.OK);
        });
};