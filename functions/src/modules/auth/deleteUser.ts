import { Request, Response } from "express";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });
export const deleteUserHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
            try {
                if (req.method !== "DELETE") {
                    return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Only DELETE allowed", HttpStatus.METHOD_NOT_ALLOWED);
                }

                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }

                const userId = currentUser.uid;
                const now = adminRef.firestore.FieldValue.serverTimestamp();

                // 1️⃣ Soft delete Firestore profile
                await db.collection("users").doc(userId).update({
                    deleted: true,
                    deleted_at: now,
                });

                await db.collection("customer_profiles").doc(userId).update({
                    deleted: true,
                    deleted_at: now,
                });

                // 2️⃣ Disable future scans / actions (optional)
                const qrSnap = await db.collection("qr_codes")
                    .where("used_by", "==", userId)
                    .get();

                const batch = db.batch();
                qrSnap.forEach(doc => {
                    batch.update(doc.ref, { disabled_for_user: true });
                });
                await batch.commit();

                // 3️⃣ Delete Firebase Auth user (final step)
                await adminRef.auth().deleteUser(userId);

                return sendSuccess(res, { message: "User account deleted safely" }, HttpStatus.OK);

            } catch (err: any) {
                console.error("Delete User Error:", err);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, err.message, err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};