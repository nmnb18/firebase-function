import { adminRef, db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";
import crypto from "crypto";
import { generateQRBase64 } from "../../utils/qr-helper";

interface GenerateUserQROutput {
    success: boolean;
    data: {
        user_id: string;
        token: string;
        qr_base64: string;
        created_at: any;
        updated_at: any;
    };
}

export const generateUserQR = createCallableFunction<void, GenerateUserQROutput>(
    async (data, auth, context) => {
        const qrRef = db.collection("user_qr").doc(auth!.uid);
        const qrSnap = await qrRef.get();

        // Return existing QR
        if (qrSnap.exists) {
            return {
                success: true,
                data: qrSnap.data() as any,
            };
        }

        // Generate secure token
        const token = crypto.randomBytes(32).toString("hex");
        const now = adminRef.firestore.FieldValue.serverTimestamp();

        // Build safe payload (NO PII)
        const payload = {
            v: 1,
            t: "USER_EARN",
            token,
        };

        const qrData = JSON.stringify(payload);
        const qrBase64 = await generateQRBase64(qrData);

        // Store token → user mapping
        await db.collection("qr_tokens").doc(token).set({
            token,
            user_id: auth!.uid,
            status: "active",
            created_at: now,
            last_used_at: null,
        });

        // Store user QR (once)
        const qrDoc = {
            user_id: auth!.uid,
            token,
            qr_base64: qrBase64,
            created_at: now,
            updated_at: now,
        };

        await qrRef.set(qrDoc);

        return {
            success: true,
            data: qrDoc,
        };
    },
    {
        region: "asia-south1",
        requireAuth: true,
    }
);
