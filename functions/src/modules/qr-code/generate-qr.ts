import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser, handleAuthError } from "../../middleware/auth";
import { generateQRBase64, generateQRId, generateHiddenCode } from "../../utils/qr-helper";
import { QRCodeGenerateRequest, QRCodeResponse } from "./types";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const generateQRCode = functions.https.onRequest(async (request, response) => {
    corsHandler(request, response, async () => {
        try {
            // Check HTTP method
            if (request.method !== "POST") {
                response.status(405).json({ error: "Method not allowed" });
                return;
            }

            // Authenticate user using common helper
            const currentUser = await authenticateUser(request.headers.authorization);

            const { points_value = 1, expires_in_minutes = 60, qr_code_type = 'dynamic' } = request.body as QRCodeGenerateRequest;

            // Get seller profile
            const profilesRef = db.collection('seller_profiles');
            const profileQuery = await profilesRef
                .where('user_id', '==', currentUser.uid)
                .limit(1)
                .get();

            if (profileQuery.empty) {
                response.status(404).json({ error: "Seller profile not found" });
                return;
            }

            const profileDoc = profileQuery.docs[0];
            const sellerId = profileDoc.id;
            const profile = profileDoc.data();

            const qrType = qr_code_type || profile.qr_code_type;

            // Check subscription limits for FREE tier
            if (profile.subscription_tier === 'free') {
                const monthStart = new Date();
                monthStart.setDate(1);
                monthStart.setHours(0, 0, 0, 0);

                const qrRef = db.collection('qr_codes');
                const countQuery = await qrRef
                    .where('seller_id', '==', sellerId)
                    .where('created_at', '>=', monthStart)
                    .get();

                if (countQuery.size >= 10) {
                    response.status(403).json({
                        error: "Monthly QR limit reached. Upgrade to Pro."
                    });
                    return;
                }
            }

            // Generate QR data
            const qrId = generateQRId();
            let hiddenCode: string | null = null;
            let expiresAt: Date | null = null;
            let oldQrId = null;

            if (qrType === 'dynamic') {
                expiresAt = new Date(Date.now() + (expires_in_minutes * 60 * 1000));
            } else if (qrType === 'static_hidden') {
                hiddenCode = generateHiddenCode(8);
            }

            // 1️⃣ Fetch active QR for this seller
            const activeQR = await db
                .collection("qr_codes")
                .where("seller_id", "==", sellerId)
                .where("status", "==", "active")
                .limit(1)
                .get();

            // 2️⃣ If one exists, mark it as inactive
            if (!activeQR.empty) {
                const oldQR = activeQR.docs[0];
                oldQrId = oldQR.id;
                await db.collection("qr_codes").doc(oldQR.id).update({
                    status: "inactive",
                    deactivated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                });
            }

            // Create QR document
            const qrDoc = {
                qr_id: qrId,
                seller_id: sellerId,
                qr_type: qrType,
                points_value: points_value,
                used: false,
                expires_at: expiresAt,
                status: 'active',
                hidden_code: hiddenCode,
                created_at: new Date(),
                previous_qr_id: oldQrId
            };

            await db.collection('qr_codes').add(qrDoc);

            // Generate QR code image
            const qrData = `grabbitt://${qrId}`;
            const qrBase64 = await generateQRBase64(qrData);

            const responseData: QRCodeResponse = {
                qr_id: qrId,
                qr_code_base64: qrBase64,
                qr_type: qrType,
                expires_at: expiresAt,
                hidden_code: hiddenCode
            };

            response.status(200).json({ success: true, data: responseData });

        } catch (error: any) {
            // Use common auth error handler
            if (error.name === 'AuthError') {
                return handleAuthError(error, response);
            }

            console.error('Generate QR Error:', error);
            response.status(500).json({ error: error.message });
        }
    });
});