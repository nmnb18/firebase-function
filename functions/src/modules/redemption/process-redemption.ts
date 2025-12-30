import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { Redemption } from "../../types/redemption";

const corsHandler = cors({ origin: true });

export const processRedemption = functions.https.onRequest(
    { region: 'asia-south1' }, async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            try {
                // Authenticate seller
                const sellerUser = await authenticateUser(req.headers.authorization);

                const { redemption_id, seller_notes } = req.body;

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

                // Check if seller matches
                if (redemption.seller_id !== sellerUser.uid) {
                    return res.status(403).json({ error: "Not authorized to process this redemption" });
                }

                // 2. Check redemption status
                if (redemption.status !== "pending") {
                    return res.status(400).json({
                        error: `Redemption already ${redemption.status}`
                    });
                }

                // 4. Deduct points from user
                const pointsQuery = await db.collection("points")
                    .where("user_id", "==", redemption.user_id)
                    .where("seller_id", "==", redemption.seller_id)
                    .limit(1)
                    .get();

                if (!pointsQuery.empty) {
                    const pointsDoc = pointsQuery.docs[0];
                    const currentPoints = pointsDoc.data().points || 0;

                    if (currentPoints < Number(redemption.points)) {
                        // User doesn't have enough points (shouldn't happen with point holds)
                        await redemptionRef.update({
                            status: "cancelled",
                            updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                            metadata: {
                                ...redemption.metadata,
                                seller_notes: seller_notes || "Insufficient points"
                            }
                        });

                        // Release point hold
                        await releasePointHold(redemption_id);

                        return res.status(400).json({ error: "User has insufficient points" });
                    }

                    // Deduct points
                    const newPoints = currentPoints - Number(redemption.points);
                    await pointsDoc.ref.update({
                        points: newPoints,
                        last_updated: adminRef.firestore.FieldValue.serverTimestamp()
                    });
                }

                // 5. Update redemption status
                await redemptionRef.update({
                    status: "redeemed",
                    redeemed_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        ...redemption.metadata,
                        seller_notes: seller_notes || ""
                    }
                });

                // 6. Create transaction record
                await db.collection("transactions").add({
                    user_id: redemption.user_id,
                    seller_id: redemption.seller_id,
                    seller_name: redemption.seller_shop_name,
                    points: -Number(redemption.points), // Negative for redemption
                    transaction_type: "redeem",
                    redemption_id: redemption_id,
                    timestamp: adminRef.firestore.FieldValue.serverTimestamp(),
                    description: `Redeemed ${redemption.points} points via QR`
                });

                // 7. Update seller stats
                const sellerRef = db.collection("seller_profiles").doc(redemption.seller_id);
                await sellerRef.update({
                    "stats.total_points_redeemed": adminRef.firestore.FieldValue.increment(Number(redemption.points)),
                    "stats.total_redemptions": adminRef.firestore.FieldValue.increment(1)
                });

                // 8. Release point hold
                await releasePointHold(redemption_id);

                // 9. Return success response
                return res.status(200).json({
                    success: true,
                    message: "Redemption processed successfully",
                    redemption_id: redemption_id,
                    points_redeemed: Number(redemption.points),
                    user_name: redemption.user_name,
                    timestamp: new Date().toISOString()
                });

            } catch (error: any) {
                console.error("Process redemption error:", error);
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