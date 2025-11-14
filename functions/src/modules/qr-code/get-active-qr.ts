import * as functions from "firebase-functions";
import { db, adminRef } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { generateQRBase64 } from "../../utils/qr-helper";
import { QRCodeResponse } from "./types";

const corsHandler = cors({ origin: true });

export const getActiveQR = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Only GET allowed" });
            }

            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            // 1️⃣ Get seller profile
            const sellerQuery = await db.collection("seller_profiles")
                .where("user_id", "==", currentUser.uid)
                .limit(1)
                .get();

            if (sellerQuery.empty) {
                return res.status(404).json({ error: "Seller profile not found" });
            }

            const sellerId = sellerQuery.docs[0].id;

            // 2️⃣ Fetch the ONLY active QR for this seller
            const qrQuery = await db.collection("qr_codes")
                .where("seller_id", "==", sellerId)
                .where("status", "==", "active")
                .limit(1)
                .get();

            // 3️⃣ No active QR exists
            if (qrQuery.empty) {
                return res.status(204).json({ success: true, data: {} });
            }

            const qrDoc = qrQuery.docs[0];
            const qr = qrDoc.data() as QRCodeResponse;
            const now = Date.now();

            // 4️⃣ Check expiry (for dynamic QR)
            if (qr.qr_type === "dynamic" && qr.expires_at) {
                const expiresAt = qr.expires_at instanceof Date
                    ? qr.expires_at.getTime()   // JS Date
                    : qr.expires_at.toMillis();

                if (expiresAt <= now) {
                    await qrDoc.ref.update({
                        status: "inactive",
                        expires_at: new Date(),
                    });

                    return res.status(204).json({ success: true, data: {} });
                }
            }


            // 5️⃣ Generate QR base64 to send back
            const qrData = `grabbitt://${qr.qr_id}`;
            const qrBase64 = await generateQRBase64(qrData);

            const responseData: QRCodeResponse = {
                ...qr,
                qr_code_base64: qrBase64,
            };

            return res.status(200).json({ success: true, data: responseData });

        } catch (error: any) {
            console.error("getActiveQR error:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    });
});
