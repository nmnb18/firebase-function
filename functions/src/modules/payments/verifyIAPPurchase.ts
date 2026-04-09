import { Request, Response } from "express";
import cors from "cors";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });

const PLAN_CONFIG = {
    seller_pro_30d: {
        id: "seller_pro_30d",
        name: "pro",
        price: 0, // Apple controls the price — DO NOT store price here
        durationDays: 30,
        monthly_qr_limit: 9999, // your choice
    },

    seller_premium_1yr: {
        id: "seller_premium_1yr",
        name: "premium",
        price: 0, // Apple controls pricing
        durationDays: 365,
        monthly_qr_limit: 99999, // unlimited or high number
    },
} as const;

/**
 * Decode Apple on-device JWS (purchaseToken)
 * NOTE: Pre-launch safe (no crypto verification yet)
 */
function decodeApplePurchaseToken(jws: string) {
    const parts = jws.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid Apple JWS format");
    }

    return JSON.parse(
        Buffer.from(parts[1], "base64").toString("utf8")
    );
}

export const verifyIAPPurchaseHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") {
                    return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Only POST allowed", HttpStatus.METHOD_NOT_ALLOWED);
                }

                const currentUser = await authenticateUser(
                    req.headers.authorization
                );
                if (!currentUser?.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }

                const { purchaseToken, productId, transactionId } = req.body;

                if (!purchaseToken || !productId || !transactionId) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Missing purchaseToken, productId, or transactionId", HttpStatus.BAD_REQUEST);
                }

                const plan = PLAN_CONFIG[productId as keyof typeof PLAN_CONFIG];
                if (!plan) {
                    return sendError(res, ErrorCodes.INVALID_INPUT, "Invalid plan", HttpStatus.BAD_REQUEST);
                }

                // 🔓 Decode Apple payload
                const payload = decodeApplePurchaseToken(purchaseToken);

                // ✅ Validate core fields
                if (payload.productId !== productId) {
                    throw new Error("Product mismatch");
                }

                if (payload.transactionId !== transactionId) {
                    throw new Error("Transaction mismatch");
                }

                if (!payload.expiresDate) {
                    throw new Error("Missing expiry in Apple payload");
                }
                const now = new Date();
                const expiresAt = new Date(
                    now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
                );;
                const originalTransactionId = payload.originalTransactionId;
                const environment = payload.environment; // Sandbox / Production

                const sellerId = currentUser.uid;

                // 🔒 Prevent duplicate processing
                const historyRef = db
                    .collection("subscription_history")
                    .doc(sellerId)
                    .collection("records");

                const existing = await historyRef
                    .where(
                        "original_transaction_id",
                        "==",
                        originalTransactionId
                    )
                    .limit(1)
                    .get();

                if (!existing.empty) {
                    return sendSuccess(res, {
                        message: "Subscription already processed",
                    }, HttpStatus.OK);
                }

                /**
                 * ATOMIC BATCH WRITE: seller profile + subscription + history
                 */
                const batch = db.batch();

                // 1️⃣ Update seller_profiles
                const sellerRef = db.collection("seller_profiles").doc(sellerId);
                batch.update(sellerRef, {
                    subscription: {
                        tier: plan.name,
                        expires_at: adminRef.firestore.Timestamp.fromDate(
                            expiresAt
                        ),
                        qr_limit: plan.monthly_qr_limit,
                        updated_at:
                            adminRef.firestore.FieldValue.serverTimestamp(),
                        last_payment: {
                            store: "apple",
                            product_id: productId,
                            transaction_id: transactionId,
                            original_transaction_id: originalTransactionId,
                            environment,
                            paid_at:
                                adminRef.firestore.FieldValue.serverTimestamp(),
                        },
                    },
                });

                // 2️⃣ Update seller_subscriptions
                const subscriptionRef = db.collection("seller_subscriptions").doc(sellerId);
                batch.set(
                    subscriptionRef,
                    {
                        tier: plan.name,
                        status: "active",
                        price: null, // Apple controls pricing
                        original_price: null,
                        monthly_qr_limit: plan.monthly_qr_limit,
                        current_period_start:
                            adminRef.firestore.FieldValue.serverTimestamp(),
                        current_period_end:
                            adminRef.firestore.Timestamp.fromDate(expiresAt),
                        store: "apple",
                        updated_at:
                            adminRef.firestore.FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );

                // 3️⃣ Insert subscription_history record
                const historyRecordRef = historyRef.doc();
                batch.set(historyRecordRef, {
                    store: "apple",
                    product_id: productId,
                    transaction_id: transactionId,
                    original_transaction_id: originalTransactionId,
                    plan_id: productId,
                    seller_id: sellerId,
                    amount: null,
                    original_amount: null,
                    environment,
                    status: "paid",
                    paid_at:
                        adminRef.firestore.FieldValue.serverTimestamp(),
                    expires_at:
                        adminRef.firestore.Timestamp.fromDate(expiresAt),
                });

                // Commit all writes atomically
                await batch.commit();

                return sendSuccess(res, {
                    message: "Apple subscription verified",
                    subscription: {
                        order_id: transactionId,
                        plan: plan.name,
                        expires_at: expiresAt.toISOString(),
                        monthly_qr_limit: plan.monthly_qr_limit,
                    },
                }, HttpStatus.OK);
            } catch (error: any) {
                console.error("verifyIAPPurchase error:", error);
                return sendError(res, ErrorCodes.PAYMENT_VERIFICATION_FAILED, error.message || "Verification failed", error.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};