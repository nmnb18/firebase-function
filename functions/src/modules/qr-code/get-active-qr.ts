import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";
import { generateQRBase64 } from "../../utils/qr-helper";
import { QRCodeResponse } from "./types";

interface GetActiveQROutput {
    success: boolean;
    data: QRCodeResponse[];
}

export const getActiveQR = createCallableFunction<void, GetActiveQROutput>(
    async (data, auth, context) => {
        // Fetch seller profile
        const sellerQuery = await db
            .collection("seller_profiles")
            .where("user_id", "==", auth!.uid)
            .limit(1)
            .get();

        if (sellerQuery.empty) {
            throw new Error("Seller profile not found");
        }

        const sellerId = sellerQuery.docs[0].id;

        // Fetch all active QRs
        const qrSnapshot = await db
            .collection("qr_codes")
            .where("seller_id", "==", sellerId)
            .where("status", "==", "active")
            .get();

        if (qrSnapshot.empty) {
            return {
                success: true,
                data: [],
            };
        }

        const now = Date.now();
        const batch = db.batch();
        let hasBatchUpdates = false;
        const validQrs: QRCodeResponse[] = [];

        // Handle expiry + base64
        for (const doc of qrSnapshot.docs) {
            const qr = doc.data() as QRCodeResponse;

            // Dynamic expiry
            if (qr.qr_type === "dynamic" && qr.expires_at) {
                const expiresAt =
                    qr.expires_at instanceof Date
                        ? qr.expires_at.getTime()
                        : (qr.expires_at as any).toMillis();

                if (expiresAt <= now) {
                    batch.update(doc.ref, {
                        status: "inactive",
                        expires_at: new Date(),
                    });
                    hasBatchUpdates = true;
                    continue;
                }
            }

            // Generate Base64
            const qrData = `grabbitt://${qr.qr_id}`;
            const qrBase64 = await generateQRBase64(qrData);

            validQrs.push({
                ...qr,
                qr_code_base64: qrBase64,
            });
        }

        if (hasBatchUpdates) {
            await batch.commit();
        }

        return {
            success: true,
            data: validQrs,
        };
    },
    {
        region: "asia-south1",
        requireAuth: true,
    }
);
