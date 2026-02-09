import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const getRedemptionStatus = functions.https.onRequest(
    { region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' },
    async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            try {
                // ✅ AUTH
                const currentUser = await authenticateUser(req.headers.authorization);

                const { redemption_id } = req.query;
                if (!redemption_id) {
                    return res.status(400).json({ error: "redemption_id is required" });
                }

                // ✅ Find redemption by redemption_id
                const redemptionsQuery = await db.collection("redemptions")
                    .where("redemption_id", "==", redemption_id)
                    .limit(1)
                    .get();

                if (redemptionsQuery.empty) {
                    return res.status(404).json({ error: "Redemption not found" });
                }

                const redemptionDoc = redemptionsQuery.docs[0];
                let redemptionData = redemptionDoc.data();

                // ✅ Ownership check
                if (redemptionData.user_id !== currentUser.uid) {
                    return res.status(403).json({ error: "Not authorized to view this redemption" });
                }

                // ✅ Auto-expire if past expires_at and still pending
                const now = Date.now();
                let expiresAtMs: number;

                if (redemptionData.expires_at?.toDate) {
                    expiresAtMs = redemptionData.expires_at.toDate().getTime();
                } else if (typeof redemptionData.expires_at === "number") {
                    expiresAtMs = redemptionData.expires_at;
                } else {
                    expiresAtMs = new Date(redemptionData.expires_at).getTime();
                }

                if (redemptionData.status === "pending" && now >= expiresAtMs) {
                    // Update Firestore to mark expired
                    await redemptionDoc.ref.update({ status: "expired" });
                    await releasePointHold(redemption_id as string);
                    redemptionData.status = "expired";
                }

                // ✅ Return updated redemption object
                return res.status(200).json({
                    success: true,
                    redemption: {
                        ...redemptionData,
                        redemption_id: redemptionData.redemption_id,
                        created_at: redemptionData.created_at?.toDate?.() || redemptionData.created_at,
                        redeemed_at: redemptionData.redeemed_at?.toDate?.() || redemptionData.redeemed_at,
                        expires_at: redemptionData.expires_at?.toDate?.() || redemptionData.expires_at,
                    },
                });

            } catch (error: any) {
                console.error("Get redemption status error:", error);
                return res.status(err.statusCode ?? 500).json({ error: error.message });
            }
        });
    }
);


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