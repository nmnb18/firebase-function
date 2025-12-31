import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser, handleAuthError } from "../../middleware/auth";
import {
    generateQRBase64,
    generateQRId,
    generateHiddenCode,
} from "../../utils/qr-helper";
import { QRCodeGenerateRequest, QRCodeResponse } from "./types";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const generateQRCode = functions.https.onRequest(
    { region: 'asia-south1' },
    async (request, response) => {
        corsHandler(request, response, async () => {
            try {
                // ------------------------------
                // METHOD CHECK
                // ------------------------------
                if (request.method !== "POST") {
                    response.status(405).json({ error: "Method not allowed" });
                    return;
                }

                // ------------------------------
                // AUTH
                // ------------------------------
                const currentUser = await authenticateUser(
                    request.headers.authorization
                );

                const {
                    amount = 1,
                    expires_in_minutes = 60,
                    qr_code_type = "dynamic",
                    points// dynamic | static | static_hidden | multiple
                } = request.body as QRCodeGenerateRequest;

                // ------------------------------
                // FETCH SELLER PROFILE
                // ------------------------------
                const profilesRef = db.collection("seller_profiles");
                const profileQuery = await profilesRef
                    .where("user_id", "==", currentUser.uid)
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

                // ------------------------------
                // FREE PLAN MONTHLY LIMIT
                // ------------------------------
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
                        response.status(403).json({
                            error: "Monthly QR limit reached. Upgrade to Pro.",
                        });
                        return;
                    }
                }

                // ------------------------------
                // GENERATE QR METADATA
                // ------------------------------
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
                    expiresAt = new Date(Date.now() + 1440 * 60 * 1000); // expires in 24 hrs
                }

                // ====================================================
                // ✅ SMART QR MODE SWITCH LOGIC
                // ====================================================
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

                    // ✅ CASE 1: Switching FROM multiple → single
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

                    // ✅ CASE 2: Switching FROM single → multiple
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

                    // ✅ CASE 3: Staying in single-QR mode → deactivate only latest
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

                // ------------------------------
                // CREATE QR DOCUMENT
                // ------------------------------
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

                // ------------------------------
                // GENERATE QR IMAGE
                // ------------------------------
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

                response.status(200).json({
                    success: true,
                    data: responseData,
                });
            } catch (error: any) {
                if (error.name === "AuthError") {
                    return handleAuthError(error, response);
                }

                console.error("Generate QR Error:", error);
                response.status(500).json({ error: error.message });
            }
        });
    }
);
