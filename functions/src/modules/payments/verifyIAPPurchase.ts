// firebase-functions/src/subscriptions/verifyIAPPurchase.ts
import * as functions from "firebase-functions";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import axios from "axios";
import cors from "cors";
const corsHandler = cors({ origin: true });

const PLAN_CONFIG = {
    seller_pro_30d: {
        id: "seller_pro_30d",
        name: "Seller Pro 30 Days",
        price: 0, // Apple controls the price — DO NOT store price here
        durationDays: 30,
        monthly_qr_limit: 9999, // your choice
    },

    seller_premium_1yr: {
        id: "seller_premium_1yr",
        name: "Seller Premium 1 Year",
        price: 0, // Apple controls pricing
        durationDays: 365,
        monthly_qr_limit: 99999, // unlimited or high number
    },
} as const;

export const verifyIAPPurchase = functions.https.onRequest(
    { secrets: ["APPLE_SHARED_SECRET"] },
    async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                res.set("Access-Control-Allow-Origin", "*");
                res.set("Access-Control-Allow-Methods", "POST");
                res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

                if (req.method === "OPTIONS") return res.status(200).send("OK");
                if (req.method !== "POST") {
                    return res.status(405).json({ error: "Method not allowed" });
                }

                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser?.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                const { receiptData, productId, transactionId } = req.body;

                if (!receiptData || !productId || !transactionId) {
                    return res.status(400).json({ error: "Missing fields" });
                }
                // Make sure productId is valid
                const plan = PLAN_CONFIG[productId as keyof typeof PLAN_CONFIG];
                if (!plan) {
                    return res.status(400).json({ error: "Invalid productId" });
                }

                // Apple endpoints
                const APPLE_VERIFY_URL_PROD = "https://buy.itunes.apple.com/verifyReceipt";
                const APPLE_VERIFY_URL_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

                // Build request
                const payload = {
                    "receipt-data": receiptData,
                    password: process.env.APPLE_SHARED_SECRET,
                    'exclude-old-transactions': true,
                };

                /**
                    * Step 1: Try Apple PROD
                */
                let appleResponse = await axios.post(APPLE_VERIFY_URL_PROD, payload, {
                    headers: { "Content-Type": "application/json" },
                });

                // If receipt is from sandbox, Apple returns status 21007 → retry with sandbox URL
                if (appleResponse.data?.status === 21007) {
                    appleResponse = await axios.post(APPLE_VERIFY_URL_SANDBOX, payload, {
                        headers: { "Content-Type": "application/json" },
                    });
                }

                const data = appleResponse.data;

                if (!data || data.status !== 0) {
                    return res.status(400).json({
                        success: false,
                        error: "Invalid receipt",
                        status: data.status,
                    });
                }

                /**
                * Step 2: Extract in_app purchase
                */
                const inAppList = data?.receipt?.in_app || [];
                const matched = inAppList.find((p: any) =>
                    p.product_id === productId &&
                    p.transaction_id === transactionId
                );

                if (!matched) {
                    return res.status(400).json({
                        success: false,
                        error: "Receipt does not match purchase",
                    });
                }

                // Compute expiry date
                const now = new Date();
                const expires_at = new Date(
                    now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
                );

                // Write subscription to Firestore
                await db.collection("seller_profiles").doc(currentUser.uid).update({
                    subscription: {
                        tier: productId,
                        expires_at: adminRef.firestore.Timestamp.fromDate(expires_at),
                        qr_limit: plan.monthly_qr_limit,
                        updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                        last_payment: {
                            product_id: productId,
                            transaction_id: transactionId,
                            environment: data["environment"], // Sandbox or Production
                            paid_at: adminRef.firestore.FieldValue.serverTimestamp(),
                        },
                    }
                });

                // Log history
                await db.collection("subscription_history")
                    .doc(currentUser.uid)
                    .collection("records")
                    .add({
                        product_id: productId,
                        transaction_id: transactionId,
                        environment: data["environment"],
                        paid_at: adminRef.firestore.FieldValue.serverTimestamp(),
                        expires_at: adminRef.firestore.Timestamp.fromDate(expires_at),
                    });

                return res.status(200).json({
                    success: true,
                    message: "Purchase validated",
                    subscription: {
                        plan: productId,
                        expires_at: expires_at.toISOString(),
                    }
                });
            } catch (error: any) {
                console.error("Verify IAP Error:", error?.message || error);
                return res.status(500).json({ error: error.message });
            }
        })
    }
);
