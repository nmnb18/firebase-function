import { Request, Response } from "express";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser, handleAuthError } from "../../middleware/auth";
import cors from "cors";
import crypto from "crypto";
import { generateQRBase64 } from "../../utils/qr-helper";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

export const generateUserQRHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "GET") {
                    return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
                }

                const currentUser = await authenticateUser(
                    req.headers.authorization
                );

                const qrRef = db.collection("user_qr").doc(currentUser.uid);
                const qrSnap = await qrRef.get();

                // ------------------------------
                // RETURN EXISTING QR
                // ------------------------------
                if (qrSnap.exists) {
                    return sendSuccess(res, qrSnap.data(), HttpStatus.OK);
                }

                // ------------------------------
                // GENERATE SECURE TOKEN
                // ------------------------------
                const token = crypto.randomBytes(32).toString("hex");
                const now = adminRef.firestore.FieldValue.serverTimestamp();

                // ------------------------------
                // BUILD SAFE PAYLOAD (NO PII)
                // ------------------------------
                const payload = {
                    v: 1,
                    t: "USER_EARN",
                    token,
                };

                const qrData = JSON.stringify(payload);
                const qrBase64 = await generateQRBase64(qrData);

                // ------------------------------
                // STORE TOKEN → USER MAPPING
                // ------------------------------
                await db.collection("qr_tokens").doc(token).set({
                    token,
                    user_id: currentUser.uid,
                    status: "active", // active | revoked
                    created_at: now,
                    last_used_at: null,
                });

                // ------------------------------
                // STORE USER QR (ONCE)
                // ------------------------------
                const qrDoc = {
                    user_id: currentUser.uid,
                    token,
                    qr_base64: qrBase64,
                    created_at: now,
                    updated_at: now,
                };

                await qrRef.set(qrDoc);

                return sendSuccess(res, qrDoc, HttpStatus.OK);
            } catch (error: any) {
                if (error.name === "AuthError") {
                    return handleAuthError(error, res);
                }

                console.error("Generate User QR Error:", error);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, error.message || "Internal server error", error.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};