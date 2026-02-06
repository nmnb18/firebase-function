import { adminRef, db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";
import {
    generateQRBase64,
    generateQRId,
    generateHiddenCode,
} from "../../utils/qr-helper";
import { QRCodeGenerateRequest, QRCodeResponse } from "./types";

interface GenerateQRCodeInput {
    amount?: number;
    expires_in_minutes?: number;
    qr_code_type?: string;
    points?: number;
}

interface GenerateQRCodeOutput {
    success: boolean;
    data: QRCodeResponse;
}

export const generateQRCode = createCallableFunction<GenerateQRCodeInput, GenerateQRCodeOutput>(
    async (data, auth, context) => {
        const {
            amount = 1,
            expires_in_minutes = 60,
            qr_code_type = "dynamic",
            points
        } = data;

        // Fetch seller profile
        const profilesRef = db.collection("seller_profiles");
        const profileQuery = await profilesRef
            .where("user_id", "==", auth!.uid)
            .limit(1)
            .get();

        if (profileQuery.empty) {
            throw new Error("Seller profile not found");
        }

        const profileDoc = profileQuery.docs[0];
        const sellerId = profileDoc.id;
        const profile = profileDoc.data();

        const qrType = qr_code_type || profile.qr_code_type;

        // Check free plan monthly limit
        if (profile.subscription_tier === "free") {
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const qrRef = db.collection("qr_codes");
            const countQuery = await qrRef
                .where("seller_id", "==", sellerId)
                .where("created_at", ">=", monthStart)
                .get();

            if (countQuery.size >= 5) {
                throw new Error("Monthly QR limit reached. Upgrade to Pro.");
            }
        }

        // Generate QR metadata
        const qrId = generateQRId();
        let hiddenCode: string | null = null;
        let expiresAt: Date | null = null;
        let oldQrId: string | null = null;

        if (qrType === "dynamic") {
            expiresAt = new Date(
                Date.now() + expires_in_minutes * 60 * 1000
            );
        } else if (qrType === "static_hidden") {
            hiddenCode = generateHiddenCode(8);
        } else if (qrType === "static" && profile.subscription_tier === "free") {
            expiresAt = new Date(Date.now() + 1440 * 60 * 1000);
        }

        // Smart QR mode switch logic
        const activeQRsSnapshot = await db
            .collection("qr_codes")
            .where("seller_id", "==", sellerId)
            .where("status", "==", "active")
            .get();

        if (!activeQRsSnapshot.empty) {
            const activeQRs = activeQRsSnapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            }));

            const hasActiveMultiple = activeQRs.some(
                (qr: any) => qr.qr_type === "multiple"
            );

            const hasActiveSingle = activeQRs.some(
                (qr: any) => qr.qr_type !== "multiple"
            );

            const batch = db.batch();

            // Case 1: Switching FROM multiple → single
            if (hasActiveMultiple && qrType !== "multiple") {
                activeQRs
                    .filter((qr: any) => qr.qr_type === "multiple")
                    .forEach((qr: any) => {
                        batch.update(db.collection("qr_codes").doc(qr.id), {
                            status: "inactive",
                            deactivated_at:
                                adminRef.firestore.FieldValue.serverTimestamp(),
                        });
                    });
            }

            // Case 2: Switching FROM single → multiple
            if (hasActiveSingle && qrType === "multiple") {
                activeQRs
                    .filter((qr: any) => qr.qr_type !== "multiple")
                    .forEach((qr: any) => {
                        batch.update(db.collection("qr_codes").doc(qr.id), {
                            status: "inactive",
                            deactivated_at:
                                adminRef.firestore.FieldValue.serverTimestamp(),
                        });
                    });
            }

            // Case 3: Staying in single-QR mode → deactivate only latest
            if (qrType !== "multiple" && hasActiveSingle) {
                const latestSingle = activeQRs
                    .filter((qr: any) => qr.qr_type !== "multiple")
                    .sort((a: any, b: any) => {
                        const aTime = a.created_at?.toMillis?.() || 0;
                        const bTime = b.created_at?.toMillis?.() || 0;
                        return bTime - aTime;
                    })[0];

                if (latestSingle) {
                    oldQrId = latestSingle.id;

                    batch.update(
                        db.collection("qr_codes").doc(latestSingle.id),
                        {
                            status: "inactive",
                            deactivated_at:
                                adminRef.firestore.FieldValue.serverTimestamp(),
                        }
                    );
                }
            }

            await batch.commit();
        }

        // Create QR document
        const qrDoc = {
            qr_id: qrId,
            seller_id: sellerId,
            qr_type: qrType,
            points_value: points ?? profile?.rewards?.default_points_value,
            reward_type: profile?.rewards?.reward_type,
            used: false,
            expires_at: expiresAt,
            status: "active",
            hidden_code: hiddenCode,
            created_at: new Date(),
            previous_qr_id: oldQrId,
            amount: amount,
        };

        await db.collection("qr_codes").add(qrDoc);

        // Generate QR image
        const qrData = `grabbitt://${qrId}`;
        const qrBase64 = await generateQRBase64(qrData);

        const responseData: QRCodeResponse = {
            qr_id: qrId,
            qr_code_base64: qrBase64,
            qr_type: qrType,
            expires_at: expiresAt,
            points: points,
        };

        const sellerRef = db.collection("seller_profiles").doc(sellerId);
        await sellerRef.update({
            'qr_settings.qr_code_type': qrType
        })

        return {
            success: true,
            data: responseData,
        };
    },
    {
        region: "asia-south1",
        requireAuth: true,
    }
);
