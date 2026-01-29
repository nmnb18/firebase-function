import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser, handleAuthError } from "../../middleware/auth";

import cors from "cors";

import { generateQRBase64 } from "../../utils/qr-helper";
const corsHandler = cors({ origin: true });

export const generateUserQR = functions.https.onRequest(
    { region: "asia-south1" },
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
                // FETCH CUSTOMER PROFILE
                // ------------------------------
                const profileSnap = await db
                    .collection("customer_profiles")
                    .where("user_id", "==", currentUser.uid)
                    .limit(1)
                    .get();

                if (profileSnap.empty) {
                    return res.status(404).json({
                        error: "Customer profile not found",
                    });
                }

                const profile = profileSnap.docs[0].data();

                // ------------------------------
                // BUILD PAYLOAD
                // ------------------------------
                const payload = {
                    type: "USER_EARN",
                    user_id: currentUser.uid,
                    name: profile.account.name || "",
                    email: profile.account.email || "",
                    phone: profile.account.phone || "",
                    issued_at: Date.now(),
                };

                const qrData = JSON.stringify(payload);
                const qrBase64 = await generateQRBase64(qrData);

                const now = adminRef.firestore.FieldValue.serverTimestamp();

                // ------------------------------
                // STORE ONCE
                // ------------------------------
                const qrDoc = {
                    user_id: currentUser.uid,
                    qr_base64: qrBase64,
                    payload,
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
                return res.status(500).json({
                    error: error.message || "Internal server error",
                });
            }
        });
    }
);
