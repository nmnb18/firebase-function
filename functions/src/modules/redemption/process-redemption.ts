import { createCallableFunction } from "../../utils/callable";
import { adminRef, db } from "../../config/firebase";
import { Redemption } from "../../types/redemption";
import { saveNotification } from "../../utils/helper";
import pushService, {
    NotificationChannel,
    NotificationType,
} from "../../services/expo-service";

async function releasePointHold(redemptionId: string) {
    const holdsQuery = await db
        .collection("point_holds")
        .where("redemption_id", "==", redemptionId)
        .where("status", "==", "reserved")
        .limit(1)
        .get();

    if (!holdsQuery.empty) {
        await holdsQuery.docs[0].ref.update({
            status: "released",
            released_at: adminRef.firestore.FieldValue.serverTimestamp(),
        });
    }
}

interface ProcessRedemptionRequest {
    redemption_id: string;
    seller_notes?: string;
}

export const processRedemption = createCallableFunction<
    ProcessRedemptionRequest,
    any
>(
    async (data, auth) => {
        const { redemption_id, seller_notes } = data;

        if (!redemption_id) {
            throw new Error("redemption_id is required");
        }

        const sellerId = auth!.uid;

        // Get redemption
        const redemptionRef = db.collection("redemptions").doc(redemption_id);
        const redemptionDoc = await redemptionRef.get();

        if (!redemptionDoc.exists) {
            throw new Error("Redemption not found");
        }

        const redemption = redemptionDoc.data() as Redemption;

        // Check if seller matches
        if (redemption.seller_id !== sellerId) {
            throw new Error("Not authorized to process this redemption");
        }

        // Check redemption status
        if (redemption.status !== "pending") {
            throw new Error(`Redemption already ${redemption.status}`);
        }

        // Check if QR is expired
        const expiresAtMillis =
            redemption.expires_at instanceof adminRef.firestore.Timestamp
                ? redemption.expires_at.toMillis()
                : redemption.expires_at instanceof Date
                    ? redemption.expires_at.getTime()
                    : 0;

        if (expiresAtMillis < Date.now()) {
            // Mark redemption expired and release point hold in parallel
            await Promise.all([
                redemptionRef.update({
                    status: "expired",
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        ...redemption.metadata,
                        seller_notes: "QR expired",
                    },
                }),
                releasePointHold(redemption_id),
            ]);

            throw new Error("QR code has expired. Please ask customer to regenerate.");
        }

        // Get user's points
        const pointsQuery = await db
            .collection("points")
            .where("user_id", "==", redemption.user_id)
            .where("seller_id", "==", redemption.seller_id)
            .limit(1)
            .get();

        if (!pointsQuery.empty) {
            const pointsDoc = pointsQuery.docs[0];
            const currentPoints = pointsDoc.data().points || 0;

            if (currentPoints < Number(redemption.points)) {
                // User doesn't have enough points (shouldn't happen with point holds)
                await Promise.all([
                    redemptionRef.update({
                        status: "cancelled",
                        updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                        metadata: {
                            ...redemption.metadata,
                            seller_notes: seller_notes || "Insufficient points",
                        },
                    }),
                    releasePointHold(redemption_id),
                ]);

                throw new Error("User has insufficient points");
            }

            // Deduct points
            const newPoints = currentPoints - Number(redemption.points);
            await pointsDoc.ref.update({
                points: newPoints,
                last_updated: adminRef.firestore.FieldValue.serverTimestamp(),
            });
        }

        // Update redemption status and create transaction in parallel
        await Promise.all([
            redemptionRef.update({
                status: "redeemed",
                redeemed_at: adminRef.firestore.FieldValue.serverTimestamp(),
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    ...redemption.metadata,
                    seller_notes: seller_notes || "",
                },
            }),
            db.collection("transactions").add({
                user_id: redemption.user_id,
                seller_id: redemption.seller_id,
                customer_name: redemption.user_name,
                seller_name: redemption.seller_shop_name,
                points: -Number(redemption.points), // Negative for redemption
                transaction_type: "redeem",
                redemption_id: redemption_id,
                timestamp: adminRef.firestore.FieldValue.serverTimestamp(),
                description: `Redeemed ${redemption.points} points via QR`,
            }),
        ]);

        // Update seller stats
        const sellerRef = db.collection("seller_profiles").doc(redemption.seller_id);
        await sellerRef.update({
            "stats.total_points_redeemed": adminRef.firestore.FieldValue.increment(
                Number(redemption.points)
            ),
            "stats.total_redemptions": adminRef.firestore.FieldValue.increment(1),
        });

        // Release point hold
        await releasePointHold(redemption_id);

        // Send push notifications in parallel
        const [tokenSnapPush, tokenSnap1] = await Promise.all([
            db.collection("push_tokens").where("user_id", "==", redemption.user_id).get(),
            db.collection("push_tokens").where("user_id", "==", redemption.seller_id).get(),
        ]);

        // Save notifications
        await Promise.all([
            saveNotification(
                redemption.user_id,
                "⭐ Points Redeemed!",
                `You redeem ${redemption.points} points at ${redemption.seller_shop_name}`,
                {
                    type: NotificationType.REDEMPTION,
                    screen: "/(drawer)/redeem/redeem-home",
                    sellerId: redemption.seller_id,
                    points: redemption.points,
                }
            ),
            saveNotification(
                redemption.seller_id,
                "⭐ Points Redeemed!",
                `${redemption.user_name} has redeemed ${redemption.points} for ${redemption.offer_name}`,
                {
                    type: NotificationType.NEW_ORDER,
                    screen: "/(drawer)/redemptions",
                    points: redemption.points,
                }
            ),
        ]);

        // Send push notifications
        const userTokens = tokenSnapPush.docs.map((d) => d.data().token);
        const sellerTokens = tokenSnap1.docs.map((d) => d.data().token);

        const pushTasks = [];

        if (userTokens.length > 0) {
            pushTasks.push(
                pushService
                    .sendToUser(
                        userTokens,
                        "⭐ Points Redeemed!",
                        `You redeemed ${redemption.points} points at ${redemption.seller_shop_name}`,
                        {
                            type: NotificationType.REDEMPTION,
                            screen: "/(drawer)/redeem/redeem-home",
                            params: {
                                sellerId: redemption.seller_id,
                                points: redemption.points,
                            },
                        },
                        NotificationChannel.ORDERS
                    )
                    .catch((err: any) => console.error("Push failed:", err))
            );
        }

        if (sellerTokens.length > 0) {
            pushTasks.push(
                pushService
                    .sendToUser(
                        sellerTokens,
                        "⭐ Points Redeemed!",
                        `${redemption.user_name} has redeemed ${redemption.points} for ${redemption.offer_name}`,
                        {
                            type: NotificationType.NEW_ORDER,
                            screen: "/(drawer)/redemptions",
                            params: { points: redemption.points },
                        },
                        NotificationChannel.ORDERS
                    )
                    .catch((err: any) => console.error("Push failed:", err))
            );
        }

        if (pushTasks.length > 0) {
            await Promise.all(pushTasks);
        }

        // Return success response
        return {
            success: true,
            message: "Redemption processed successfully",
            redemption_id: redemption_id,
            points_redeemed: Number(redemption.points),
            user_name: redemption.user_name,
            timestamp: new Date().toISOString(),
        };
    },
    { region: "asia-south1", requireAuth: true }
);