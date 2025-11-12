import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
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

            // 1️⃣ Find seller profile
            const profilesRef = db.collection("seller_profiles");
            const profileQuery = await profilesRef
                .where("user_id", "==", currentUser.uid)
                .limit(1)
                .get();

            if (profileQuery.empty) {
                return res.status(404).json({ error: "Seller profile not found" });
            }

            const sellerDoc = profileQuery.docs[0];
            const sellerId = sellerDoc.id;

            // 2️⃣ Get all active (or recently expired) QRs for seller
            const qrRef = db.collection("qr_codes");
            const qrQuery = await qrRef
                .where("seller_id", "==", sellerId)
                .orderBy("created_at", "desc")
                .limit(5)
                .get();

            const now = Date.now();
            let activeQR: any = null;

            qrQuery.forEach((doc) => {
                const qr = doc.data();
                if (qr.qr_type === "dynamic" && qr.expires_at && qr.expires_at.toMillis() > now) {
                    if (!activeQR) activeQR = { id: doc.id, ...qr };
                } else if (qr.qr_type === "static") {
                    // fallback static QR if no dynamic active
                    if (!activeQR) activeQR = { id: doc.id, ...qr };
                }
            });

            if (!activeQR) {
                return res.status(204).json({ success: true, data: {} });
            }

            const qrData = `grabbitt://${activeQR.qr_id}`;
            const qrBase64 = await generateQRBase64(qrData);

            const responseData: QRCodeResponse = {
                ...activeQR,
                qr_code_base64: qrBase64,
            };

            return res.status(200).json({ success: true, data: responseData });

        } catch (error: any) {
            console.error("getActiveQR error:", error);
            return res.status(500).json({ error: error.message || "Server error" });
        }
    });
});
