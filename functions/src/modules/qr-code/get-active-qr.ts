import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { generateQRBase64 } from "../../utils/qr-helper";
import { QRCodeResponse } from "./types";

const corsHandler = cors({ origin: true });

export const getActiveQR = functions.https.onRequest(
    { region: 'asia-south1' }, async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                // ------------------------------
                // METHOD CHECK
                // ------------------------------
                if (req.method !== "GET") {
                    return res.status(405).json({ error: "Only GET allowed" });
                }

                // ------------------------------
                // AUTH
                // ------------------------------
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                // ------------------------------
                // FETCH SELLER PROFILE
                // ------------------------------
                const sellerQuery = await db
                    .collection("seller_profiles")
                    .where("user_id", "==", currentUser.uid)
                    .limit(1)
                    .get();

                if (sellerQuery.empty) {
                    return res.status(404).json({ error: "Seller profile not found" });
                }

                const sellerId = sellerQuery.docs[0].id;

                // ====================================================
                // ✅ FETCH ALL ACTIVE QRs
                // ====================================================
                const qrSnapshot = await db
                    .collection("qr_codes")
                    .where("seller_id", "==", sellerId)
                    .where("status", "==", "active")
                    .get();

                if (qrSnapshot.empty) {
                    return res.status(200).json({
                        success: true,
                        data: [],
                    });
                }

                const now = Date.now();
                const batch = db.batch();
                let hasBatchUpdates = false;
                const validQrs: QRCodeResponse[] = [];

                // ====================================================
                // ✅ HANDLE EXPIRY + BASE64
                // ====================================================
                for (const doc of qrSnapshot.docs) {
                    const qr = doc.data() as QRCodeResponse;

                    // ✅ Dynamic expiry
                    if (qr.qr_type === "dynamic" && qr.expires_at) {
                        const expiresAt =
                            qr.expires_at instanceof Date
                                ? qr.expires_at.getTime()
                                : qr.expires_at.toMillis();

                        if (expiresAt <= now) {
                            batch.update(doc.ref, {
                                status: "inactive",
                                expires_at: new Date(),
                            });
                            hasBatchUpdates = true;
                            continue;
                        }
                    }

                    // ✅ Generate Base64
                    const qrData = `grabbitt://${qr.qr_id}`;
                    const qrBase64 = await generateQRBase64(qrData);

                    validQrs.push({
                        ...qr,
                        qr_code_base64: qrBase64,
                    });
                }

                // ✅ ONLY COMMIT IF WE ACTUALLY UPDATED SOMETHING
                if (hasBatchUpdates) {
                    await batch.commit();
                }

                // ✅ RETURN MULTIPLE QRs
                return res.status(200).json({
                    success: true,
                    data: validQrs,
                });
            } catch (error: any) {
                console.error("getActiveQR error:", error);
                return res.status(500).json({
                    error: error.message || "Internal server error",
                });
            }
        });
    });
