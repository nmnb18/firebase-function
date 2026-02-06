import { db, adminRef } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface VerifyIAPPurchaseInput {
    purchaseToken: string;
    productId: string;
    transactionId: string;
}

interface VerifyIAPPurchaseOutput {
    success: boolean;
    message: string;
    subscription?: {
        order_id: string;
        plan: string;
        expires_at: string;
        monthly_qr_limit: number;
    };
}

const PLAN_CONFIG = {
    seller_pro_30d: {
        id: "seller_pro_30d",
        name: "pro",
        price: 0,
        durationDays: 30,
        monthly_qr_limit: 9999,
    },
    seller_premium_1yr: {
        id: "seller_premium_1yr",
        name: "premium",
        price: 0,
        durationDays: 365,
        monthly_qr_limit: 99999,
    },
} as const;

/** Decode Apple on-device JWS (purchaseToken) */
function decodeApplePurchaseToken(jws: string) {
    const parts = jws.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid Apple JWS format");
    }

    return JSON.parse(
        Buffer.from(parts[1], "base64").toString("utf8")
    );
}

export const verifyIAPPurchase = createCallableFunction<VerifyIAPPurchaseInput, VerifyIAPPurchaseOutput>(
    async (data, auth, context) => {
        const { purchaseToken, productId, transactionId } = data;

        if (!purchaseToken || !productId || !transactionId) {
            throw new Error("Missing purchaseToken, productId, or transactionId");
        }

        const plan = PLAN_CONFIG[productId as keyof typeof PLAN_CONFIG];
        if (!plan) {
            throw new Error("Invalid plan");
        }

        // Decode Apple payload
        const payload = decodeApplePurchaseToken(purchaseToken);

        // Validate core fields
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
        );
        const originalTransactionId = payload.originalTransactionId;
        const environment = payload.environment;

        const sellerId = auth!.uid;

        // Prevent duplicate processing
        const historyRef = db
            .collection("subscription_history")
            .doc(sellerId)
            .collection("records");

        const existing = await historyRef
            .where("original_transaction_id", "==", originalTransactionId)
            .limit(1)
            .get();

        if (!existing.empty) {
            return {
                success: true,
                message: "Subscription already processed",
            };
        }

        // Update seller_profiles
        await db.collection("seller_profiles").doc(sellerId).update({
            subscription: {
                tier: plan.name,
                expires_at: adminRef.firestore.Timestamp.fromDate(expiresAt),
                qr_limit: plan.monthly_qr_limit,
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                last_payment: {
                    store: "apple",
                    product_id: productId,
                    transaction_id: transactionId,
                    original_transaction_id: originalTransactionId,
                    environment,
                    paid_at: adminRef.firestore.FieldValue.serverTimestamp(),
                },
            },
        });

        // Update seller_subscriptions
        await db.collection("seller_subscriptions").doc(sellerId).set(
            {
                tier: plan.name,
                status: "active",
                price: null,
                original_price: null,
                monthly_qr_limit: plan.monthly_qr_limit,
                current_period_start: adminRef.firestore.FieldValue.serverTimestamp(),
                current_period_end: adminRef.firestore.Timestamp.fromDate(expiresAt),
                store: "apple",
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        // Insert subscription_history record
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
            paid_at: adminRef.firestore.FieldValue.serverTimestamp(),
            expires_at: adminRef.firestore.Timestamp.fromDate(expiresAt),
        });

        return {
            success: true,
            message: "Apple subscription verified",
            subscription: {
                order_id: transactionId,
                plan: plan.name,
                expires_at: expiresAt.toISOString(),
                monthly_qr_limit: plan.monthly_qr_limit,
            },
        };
    },
    {
        region: "asia-south1",
        requireAuth: true,
    }
);
