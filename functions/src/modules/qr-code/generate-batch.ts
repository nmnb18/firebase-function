import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { generateQRBase64, generateQRId, generateHiddenCode } from "../../utils/qr-helper";
import { QRCodeGenerateRequest, QRCodeBatchResponse, QRCodeResponse } from "./types";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const generateBatchQRCodes = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            // Verify authentication
            const currentUser = await authenticateUser(req.headers.authorization);

            const { amount = 1, batch_size = 100 } = req.body as QRCodeGenerateRequest;

            // Get seller profile
            const profilesRef = db.collection('seller_profiles');
            const profileQuery = await profilesRef
                .where('user_id', '==', currentUser.uid)
                .limit(1)
                .get();

            if (profileQuery.empty) {
                return res.status(404).json({ error: "Seller profile not found" });
            }

            const profileDoc = profileQuery.docs[0];
            const sellerId = profileDoc.id;
            const profile = profileDoc.data();

            if (profile.qr_code_type !== 'static_hidden') {
                return res.status(400).json({
                    error: "Batch generation only for FMCG (static_hidden) type"
                });
            }

            const finalBatchSize = Math.min(batch_size, 1000);
            const qrCodes: QRCodeResponse[] = [];
            const batch = db.batch();
            const qrRef = db.collection('qr_codes');
            const batchNumber = Date.now().toString();

            // Generate QR codes
            for (let i = 0; i < finalBatchSize; i++) {
                const qrId = generateQRId();
                const hiddenCode = generateHiddenCode(8);

                const qrDoc = {
                    qr_id: qrId,
                    seller_id: sellerId,
                    qr_type: 'static_hidden',
                    points_value: 0,
                    used: false,
                    expires_at: null,
                    hidden_code: hiddenCode,
                    created_at: new Date(),
                    batch_number: batchNumber
                };

                const docRef = qrRef.doc();
                batch.set(docRef, qrDoc);

                const qrData = `grabbitt://${qrId}`;
                const qrBase64 = await generateQRBase64(qrData);

                qrCodes.push({
                    qr_id: qrId,
                    qr_code_base64: qrBase64,
                    qr_type: 'static_hidden',
                    expires_at: null,
                });
            }

            await batch.commit();

            const response: QRCodeBatchResponse = {
                qr_codes: qrCodes,
                total_generated: finalBatchSize
            };

            return res.status(200).json({ success: true, data: response });

        } catch (error: any) {
            console.error('Batch QR Generation Error:', error);
            return res.status(500).json({ error: error.message });
        }
    });
});