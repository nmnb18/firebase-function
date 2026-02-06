import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";
import { generateQRBase64, generateQRId, generateHiddenCode } from "../../utils/qr-helper";
import { QRCodeGenerateRequest, QRCodeBatchResponse, QRCodeResponse } from "./types";

interface GenerateBatchQRCodesInput {
    amount?: number;
    batch_size?: number;
}

export const generateBatchQRCodes = createCallableFunction<GenerateBatchQRCodesInput, { success: boolean; data: QRCodeBatchResponse }>(
    async (data, auth, context) => {
        const { amount = 1, batch_size = 100 } = data;

        // Get seller profile
        const profilesRef = db.collection('seller_profiles');
        const profileQuery = await profilesRef
            .where('user_id', '==', auth!.uid)
            .limit(1)
            .get();

        if (profileQuery.empty) {
            throw new Error("Seller profile not found");
        }

        const profileDoc = profileQuery.docs[0];
        const sellerId = profileDoc.id;
        const profile = profileDoc.data();

        if (profile.qr_code_type !== 'static_hidden') {
            throw new Error("Batch generation only for FMCG (static_hidden) type");
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

        return {
            success: true,
            data: {
                qr_codes: qrCodes,
                total_generated: finalBatchSize
            }
        };
    },
    {
        region: "asia-south1",
        requireAuth: true,
    }
);