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

export const deleteUser = functions.https.onRequest(
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

                const userId = currentUser.uid;

                await db.collection("customer_profiles").doc(userId).delete();

                const dScanSnap = await db.collection("daily_scans")
                    .where("user_id", "==", userId)
                    .get();

                dScanSnap.forEach(doc => doc.ref.delete());

                const pHSnap = await db.collection("points_hold")
                    .where("user_id", "==", userId)
                    .get();

                pHSnap.forEach(doc => doc.ref.delete());

                const pSnap = await db.collection("points")
                    .where("user_id", "==", userId)
                    .get();

                pSnap.forEach(doc => doc.ref.delete());

                // 5. Delete reward history
                const rewardSnap = await db.collection("redemptions")
                    .where("user_id", "==", userId)
                    .get();

                rewardSnap.forEach(doc => doc.ref.delete());

                // 6. Delete auth user
                await adminRef.auth().deleteUser(userId);

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
