import * as functions from "firebase-functions";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";

const corsHandler = cors({ origin: true });


export const deleteSellerAccount = functions.https.onRequest(
    { region: "asia-south1" },
    (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "DELETE") {
                    return res.status(405).json({ error: "Only DELETE allowed" });
                }

                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                const sellerId = currentUser.uid;
                const now = adminRef.firestore.FieldValue.serverTimestamp();

                // 1️⃣ Soft delete seller profile
                await db.collection("seller_profiles").doc(sellerId).update({
                    deleted: true,
                    deleted_at: now,
                    status: "closed",
                });

                // 2️⃣ Cancel subscription (do NOT delete)
                await db.collection("seller_subscriptions").doc(sellerId).update({
                    status: "cancelled",
                    cancelled_at: now,
                });

                // 3️⃣ Deactivate QR codes
                const qrSnap = await db.collection("qr_codes")
                    .where("seller_id", "==", sellerId)
                    .get();

                const batch = db.batch();
                qrSnap.forEach(doc => {
                    batch.update(doc.ref, {
                        status: "inactive",
                        deactivated_at: now,
                    });
                });
                await batch.commit();

                // 4️⃣ Delete Firebase Auth user
                await adminRef.auth().deleteUser(sellerId);

                return res.status(200).json({
                    success: true,
                    message: "Seller account deleted safely",
                });

            } catch (err: any) {
                console.error("Delete Seller Error:", err);
                return res.status(500).json({ success: false, error: err.message });
            }
        });
    }
);

