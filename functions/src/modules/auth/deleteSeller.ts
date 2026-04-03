import { Request, Response } from "express";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });


export const deleteSellerAccountHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
            try {
                if (req.method !== "DELETE") {
                    return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Only DELETE allowed", HttpStatus.METHOD_NOT_ALLOWED);
                }

                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }

                const sellerId = currentUser.uid;
                const now = adminRef.firestore.FieldValue.serverTimestamp();

                // 1️⃣ Soft delete seller profile
                await db.collection("seller_profiles").doc(sellerId).update({
                    deleted: true,
                    deleted_at: now,
                    status: "closed",
                });

                // 2️⃣ Cancel subscription (do NOT delete)
                await db.collection("seller_subscriptions").doc(sellerId).update({
                    status: "cancelled",
                    cancelled_at: now,
                });

                // 3️⃣ Deactivate QR codes
                const qrSnap = await db.collection("qr_codes")
                    .where("seller_id", "==", sellerId)
                    .get();

                const batch = db.batch();
                qrSnap.forEach(doc => {
                    batch.update(doc.ref, {
                        status: "inactive",
                        deactivated_at: now,
                    });
                });
                await batch.commit();

                // 4️⃣ Delete Firebase Auth user
                await adminRef.auth().deleteUser(sellerId);

                return sendSuccess(res, { message: "Seller account deleted safely" }, HttpStatus.OK);

            } catch (err: any) {
                console.error("Delete Seller Error:", err);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, err.message, err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};

