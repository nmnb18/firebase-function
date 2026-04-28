import { Request, Response, NextFunction } from "express";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { Redemption } from "../../types/redemption";
import { saveNotification } from "../../utils/helper";
import pushService, { NotificationChannel, NotificationType } from "../../services/expo-service";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const processRedemptionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
                // Authenticate seller
                const sellerUser = await authenticateUser(req.headers.authorization);

                const { redemption_id, seller_notes } = req.body;

                if (!redemption_id) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "redemption_id is required", HttpStatus.BAD_REQUEST);
                }

                // 1. Verify seller owns this redemption
                const redemptionRef = db.collection("redemptions").doc(redemption_id);
                const redemptionDoc = await redemptionRef.get();

                if (!redemptionDoc.exists) {
                    return sendError(res, ErrorCodes.NOT_FOUND, "Redemption not found", HttpStatus.NOT_FOUND);
                }

                const redemption = redemptionDoc.data() as Redemption;
                const offerNameForMessage = redemption.offer_name || "reward";

                // Check if seller matches
                if (redemption.seller_id !== sellerUser.uid) {
                    return sendError(res, ErrorCodes.FORBIDDEN, "Not authorized to process this redemption", HttpStatus.FORBIDDEN);
                }

                // 2. Check redemption status
                if (redemption.status !== "pending") {
                    return sendError(res, ErrorCodes.REDEMPTION_ALREADY_PROCESSED, `Redemption already ${redemption.status}`, HttpStatus.BAD_REQUEST);
                }

                // 3. Checl if QR is expired
                const expiresAtMillis =
                    redemption.expires_at instanceof adminRef.firestore.Timestamp
                        ? redemption.expires_at.toMillis()
                        : redemption.expires_at instanceof Date
                            ? redemption.expires_at.getTime()
                            : 0;
                if (expiresAtMillis < Date.now()) {
                    // Mark redemption expired
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

                    return sendError(res, ErrorCodes.QR_EXPIRED, "QR code has expired. Please ask customer to regenerate.", HttpStatus.BAD_REQUEST);
                }

                // 4. Fetch points document and validate balance
                const pointsQuery = await db.collection("points")
                    .where("user_id", "==", redemption.user_id)
                    .where("seller_id", "==", redemption.seller_id)
                    .limit(1)
                    .get();

                if (pointsQuery.empty) {
                    return sendError(res, ErrorCodes.NOT_FOUND, "No points record found for this user-seller pair", HttpStatus.BAD_REQUEST);
                }

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

                    return sendError(res, ErrorCodes.INSUFFICIENT_POINTS, "User has insufficient points", HttpStatus.BAD_REQUEST);
                }

                // 5. ATOMIC BATCH WRITE: points deduction + redemption status + transaction + seller stats
                const batch = db.batch();
                const sellerRef = db.collection("seller_profiles").doc(redemption.seller_id);
                const transactionRef = db.collection("transactions").doc(); // Generate new doc ID

                // Deduct points
                const newPoints = currentPoints - Number(redemption.points);
                batch.update(pointsDoc.ref, {
                    points: newPoints,
                    last_updated: adminRef.firestore.FieldValue.serverTimestamp()
                });

                // Mark redemption as redeemed
                batch.update(redemptionRef, {
                    status: "redeemed",
                    redeemed_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        ...redemption.metadata,
                        seller_notes: seller_notes || ""
                    }
                });

                // Create transaction record
                batch.set(transactionRef, {
                    user_id: redemption.user_id,
                    seller_id: redemption.seller_id,
                    customer_name: redemption.user_name,
                    seller_name: redemption.seller_shop_name,
                    points: -Number(redemption.points),
                    transaction_type: "redeem",
                    redemption_id: redemption_id,
                    timestamp: adminRef.firestore.FieldValue.serverTimestamp(),
                    created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    description: `Redeemed ${redemption.points} points via QR`
                });

                // Update seller stats
                batch.update(sellerRef, {
                    "stats.total_points_redeemed": adminRef.firestore.FieldValue.increment(Number(redemption.points)),
                    "stats.total_redemptions": adminRef.firestore.FieldValue.increment(1)
                });

                // Commit all writes atomically
                await batch.commit();

                // 8. Parallelize all notifications and token fetches
                const [, tokenSnapUser, , tokenSnapSeller] = await Promise.all([
                    // User notification
                    saveNotification(
                        redemption.user_id,
                        "⭐ Points Redeemed!",
                        `You redeemed ${redemption.points} points at ${redemption.seller_shop_name}`,
                        {
                            type: NotificationType.REDEMPTION,
                            screen: "/(drawer)/redeem/redeem-home",
                            sellerId: redemption.seller_id,
                            points: redemption.points,
                        }
                    ),
                    // User tokens
                    db.collection("push_tokens").where("user_id", "==", redemption.user_id).get(),
                    // Seller notification
                    saveNotification(
                        redemption.seller_id,
                        "⭐ Points Redeemed!",
                        `${redemption.user_name} has redeemed ${redemption.points} points for ${offerNameForMessage}`,
                        {
                            type: NotificationType.NEW_ORDER,
                            screen: "/(drawer)/redemptions",
                            points: redemption.points,
                        }
                    ),
                    // Seller tokens
                    db.collection("push_tokens").where("user_id", "==", redemption.seller_id).get()
                ]);

                // Release point hold
                await releasePointHold(redemption_id);

                // Send push notifications (fire & forget - don't wait)
                const userTokens = tokenSnapUser.docs.map(d => d.data().token);
                if (userTokens.length > 0) {
                    pushService.sendToUser(
                        userTokens,
                        "⭐ Points Redeemed!",
                        `You redeemed ${redemption.points} points at ${redemption.seller_shop_name}`,
                        {
                            type: NotificationType.REDEMPTION,
                            screen: "/(drawer)/redeem/redeem-home",
                            params: { sellerId: redemption.seller_id, points: redemption.points },
                        },
                        NotificationChannel.ORDERS
                    ).catch(err => console.error("Push failed:", err));
                }

                const sellerTokens = tokenSnapSeller.docs.map(d => d.data().token);

                if (sellerTokens.length > 0) {
                    pushService.sendToUser(
                        sellerTokens,
                        "⭐ Points Redeemed!",
                        `${redemption.user_name} has redeemed ${redemption.points} points for ${offerNameForMessage}`,
                        {
                            type: NotificationType.NEW_ORDER,
                            screen: "/(drawer)/redemptions",
                            params: { points: redemption.points },
                        },
                        NotificationChannel.ORDERS
                    ).catch(err => console.error("Push failed:", err));
                }

                // 9. Return success response
                return sendSuccess(res, {
                    message: "Redemption processed successfully",
                    redemption_id: redemption_id,
                    points_redeemed: Number(redemption.points),
                    user_name: redemption.user_name,
                    timestamp: new Date().toISOString()
                }, HttpStatus.OK);

    } catch (err) {
        next(err);
    }
};

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