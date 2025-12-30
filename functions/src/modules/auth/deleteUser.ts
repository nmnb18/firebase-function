import * as functions from "firebase-functions";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";

const corsHandler = cors({ origin: true });
export const deleteUser = functions.https.onRequest(
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

                const userId = currentUser.uid;
                const now = adminRef.firestore.FieldValue.serverTimestamp();

                // 1️⃣ Soft delete Firestore profile
                await db.collection("users").doc(userId).update({
                    deleted: true,
                    deleted_at: now,
                });

                await db.collection("customer_profiles").doc(userId).update({
                    deleted: true,
                    deleted_at: now,
                });

                // 2️⃣ Disable future scans / actions (optional)
                const qrSnap = await db.collection("qr_codes")
                    .where("used_by", "==", userId)
                    .get();

                const batch = db.batch();
                qrSnap.forEach(doc => {
                    batch.update(doc.ref, { disabled_for_user: true });
                });
                await batch.commit();

                // 3️⃣ Delete Firebase Auth user (final step)
                await adminRef.auth().deleteUser(userId);

                return res.status(200).json({
                    success: true,
                    message: "User account deleted safely",
                });

            } catch (err: any) {
                console.error("Delete User Error:", err);
                return res.status(500).json({ success: false, error: err.message });
            }
        });
    }
);

