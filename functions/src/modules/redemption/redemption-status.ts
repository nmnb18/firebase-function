// firebase-functions/src/redemption/getRedemptionStatus.ts
import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const getRedemptionStatus = functions.https.onRequest(
    { region: 'asia-south1' }, async (req, res) => {
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

                // ✅ Find redemption by redemption_id (same pattern you use)
                const redemptionsQuery = await db.collection("redemptions")
                    .where("redemption_id", "==", redemption_id)
                    .limit(1)
                    .get();

                if (redemptionsQuery.empty) {
                    return res.status(404).json({ error: "Redemption not found" });
                }

                const redemptionDoc = redemptionsQuery.docs[0];
                const redemptionData = redemptionDoc.data();

                // ✅ Ownership check (same as your QR function)
                if (redemptionData.user_id !== currentUser.uid) {
                    return res.status(403).json({ error: "Not authorized to view this redemption" });
                }

                // ✅ Return full updated redemption object for polling
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
                return res.status(500).json({ error: error.message });
            }
        });
    });
