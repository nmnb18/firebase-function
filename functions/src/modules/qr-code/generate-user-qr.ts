import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser, handleAuthError } from "../../middleware/auth";
import cors from "cors";
import crypto from "crypto";
import { generateQRBase64 } from "../../utils/qr-helper";

const corsHandler = cors({ origin: true });

export const generateUserQR = functions.https.onRequest(
    { region: "asia-south1", timeoutSeconds: 30, memory: '256MiB' },
    async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "GET") {
                    return res.status(405).json({ error: "Method not allowed" });
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
                    return res.status(200).json({
                        success: true,
                        data: qrSnap.data(),
                    });
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

                return res.status(200).json({
                    success: true,
                    data: qrDoc,
                });
            } catch (error: any) {
                if (error.name === "AuthError") {
                    return handleAuthError(error, res);
                }

                console.error("Generate User QR Error:", error);
                return res.status(error.statusCode ?? 500).json({
                    error: error.message || "Internal server error",
                });
            }
        });
    }
);
