import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { Redemption } from "../../types/redemption";

const corsHandler = cors({ origin: true });

export const markRedemptionAsExpired = functions.https.onRequest(
    { region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {

                const { redemption_id } = req.body;

                if (!redemption_id) {
                    return res.status(400).json({ error: "redemption_id is required" });
                }

                // 1. Verify seller owns this redemption
                const redemptionRef = db.collection("redemptions").doc(redemption_id);
                const redemptionDoc = await redemptionRef.get();

                if (!redemptionDoc.exists) {
                    return res.status(404).json({ error: "Redemption not found" });
                }

                const redemption = redemptionDoc.data() as Redemption;

                await redemptionRef.update({
                    status: "expired",
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        ...redemption.metadata,
                        seller_notes: "QR expired"
                    }
                });

                // Release point hold
                await releasePointHold(redemption_id);

                return res.status(200).json({
                    success: true
                });
            }
        })
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