import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { Redemption } from "../../types/redemption";

const corsHandler = cors({ origin: true });

export const cancelRedemption = functions.https.onRequest(
    { region: 'asia-south1' }, async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            try {
                const currentUser = await authenticateUser(req.headers.authorization);
                const { redemption_id } = req.body;

                if (!redemption_id) {
                    return res.status(400).json({ error: "redemption_id is required" });
                }

                // Get redemption
                const redemptionRef = db.collection("redemptions").doc(redemption_id);
                const redemptionDoc = await redemptionRef.get();

                if (!redemptionDoc.exists) {
                    return res.status(404).json({ error: "Redemption not found" });
                }

                const redemption = redemptionDoc.data() as Redemption;

                // Check authorization (only user who created it can cancel)
                if (redemption.user_id !== currentUser.uid) {
                    return res.status(403).json({ error: "Not authorized to cancel this redemption" });
                }

                // Check if already processed
                if (redemption.status !== "pending") {
                    return res.status(400).json({
                        error: `Cannot cancel - redemption already ${redemption.status}`
                    });
                }

                // Update status
                await redemptionRef.update({
                    status: "cancelled",
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp()
                });

                // Release point hold
                await releasePointHold(redemption_id);

                return res.status(200).json({
                    success: true,
                    message: "Redemption cancelled successfully",
                    redemption_id: redemption_id
                });

            } catch (error: any) {
                console.error("Cancel redemption error:", error);
                return res.status(500).json({ error: error.message });
            }
        });
    });
async function releasePointHold(redemptionId: string) {
    const holdsQuery = await db.collection("point_holds")
        .where("redemption_id", "==", redemptionId)
        .where("status", "==", "reserved")
        .limit(1)
        .get();

    if (!holdsQuery.empty) {
        await holdsQuery.docs[0].ref.update({
            status: "released",
            released_at: adminRef.firestore.FieldValue.serverTimestamp()
        });
    }
}