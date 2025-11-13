import * as functions from "firebase-functions";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";

const corsHandler = cors({ origin: true });
/**
 * DELETE ACCOUNT FUNCTION
 * Removes:
 * - Firebase Auth user
 * - seller_profiles/{id}
 * - seller_subscriptions/{id}
 * - qr_codes where seller_id = id
 * - scans where seller_id = id
 * - reward_history where seller_id = id
 */

export const deleteSellerAccount = functions.https.onRequest(
    (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "DELETE") {
                    return res.status(405).json({ error: "Only DELETE allowed" });
                }

                const currentUser = await authenticateUser(
                    req.headers.authorization
                );

                if (!currentUser || !currentUser.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                const sellerId = currentUser.uid;

                // 1. Delete seller_profile
                await db.collection("seller_profiles").doc(sellerId).delete();

                // 2. Delete subscription
                await db.collection("seller_subscriptions").doc(sellerId).delete();

                // 3. Delete QR codes
                const qrSnap = await db.collection("qr_codes")
                    .where("seller_id", "==", sellerId)
                    .get();

                qrSnap.forEach(doc => doc.ref.delete());

                // 4. Delete scans
                const scanSnap = await db.collection("scans")
                    .where("seller_id", "==", sellerId)
                    .get();

                scanSnap.forEach(doc => doc.ref.delete());

                // 5. Delete reward history
                const rewardSnap = await db.collection("reward_history")
                    .where("seller_id", "==", sellerId)
                    .get();

                rewardSnap.forEach(doc => doc.ref.delete());

                // 6. Delete auth user
                await adminRef.auth().deleteUser(sellerId);

                return res.status(200).json({
                    success: true,
                    message: "Account deleted successfully",
                });

            } catch (err: any) {
                console.error("Delete Account Error:", err);
                return res.status(500).json({
                    success: false,
                    error: err.message || "Internal server error",
                });
            }
        });

    }
);
