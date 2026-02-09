import * as functions from "firebase-functions";
import cors from "cors";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";

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

export const verifyIAPPurchase = functions.https.onRequest(
    { region: 'asia-south1' },
    async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") {
                    return res.status(405).json({ error: "Only POST allowed" });
                }

                const currentUser = await authenticateUser(
                    req.headers.authorization
                );
                if (!currentUser?.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                const { purchaseToken, productId, transactionId } = req.body;

                if (!purchaseToken || !productId || !transactionId) {
                    return res.status(400).json({
                        error: "Missing purchaseToken, productId, or transactionId",
                    });
                }

                const plan = PLAN_CONFIG[productId as keyof typeof PLAN_CONFIG];
                if (!plan) {
                    return res.status(400).json({ error: "Invalid plan" });
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
                    return res.status(200).json({
                        success: true,
                        message: "Subscription already processed",
                    });
                }

                /**
                 * 1️⃣ Update seller_profiles (same as Razorpay)
                 */
                await db.collection("seller_profiles").doc(sellerId).update({
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

                /**
                 * 2️⃣ Update seller_subscriptions (mirror Razorpay)
                 */
                await db.collection("seller_subscriptions").doc(sellerId).set(
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

                /**
                 * 3️⃣ Insert subscription_history record
                 */
                await historyRef.add({
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

                return res.status(200).json({
                    success: true,
                    message: "Apple subscription verified",
                    subscription: {
                        order_id: transactionId,
                        plan: plan.name,
                        expires_at: expiresAt.toISOString(),
                        monthly_qr_limit: plan.monthly_qr_limit,
                    },
                });
            } catch (error: any) {
                console.error("verifyIAPPurchase error:", error);
                return res.status(err.statusCode ?? 500).json({
                    success: false,
                    error: error.message || "Verification failed",
                });
            }
        });
    }
);
