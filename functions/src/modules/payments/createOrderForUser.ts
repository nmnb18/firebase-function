import * as functions from "firebase-functions";
import Razorpay from "razorpay";
import cors from "cors";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const createOrderForUser = functions.https.onRequest(
    {
        secrets: [
            "RAZORPAY_ENV",
            "RAZORPAY_KEY_ID_TEST",
            "RAZORPAY_SECRET_TEST",

        ],
        region: "asia-south1",
    },
    async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Only POST allowed" });
            }

            try {
                // ------------------------------
                // Auth
                // ------------------------------
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                // ------------------------------
                // Request body inputs
                // ------------------------------
                const {
                    sellerId,
                    amount,
                    qr_id,
                    reason = "store_payment",
                    payment_mode = "upi"
                } = req.body;

                if (!sellerId || !amount) {
                    return res.status(400).json({
                        error: "sellerId and amount are required"
                    });
                }

                const amountPaise = Math.round(amount * 100); // convert to paise

                // ------------------------------
                // Razorpay Key Select
                // ------------------------------
                const env = process.env.RAZORPAY_ENV || "test";

                const key_id =
                    env === "live"
                        ? process.env.RAZORPAY_KEY_ID_LIVE!
                        : process.env.RAZORPAY_KEY_ID_TEST!;

                const key_secret =
                    env === "live"
                        ? process.env.RAZORPAY_SECRET_LIVE!
                        : process.env.RAZORPAY_SECRET_TEST!;

                const razorpay = new Razorpay({
                    key_id,
                    key_secret,
                });

                // ------------------------------
                // Create Order
                // ------------------------------
                const options = {
                    amount: amountPaise,
                    currency: "INR",
                    receipt: `GBT-USER-${currentUser.uid.slice(0, 6)}-${Date.now().toString().slice(-6)}`,
                    notes: {
                        sellerId,
                        userId: currentUser.uid,
                        qr_id,
                        payment_mode,
                        reason
                    }
                };

                const order = await razorpay.orders.create(options);

                // ------------------------------
                // Save initial payment record
                // ------------------------------
                await db.collection("user_payments").doc(order.id).set({
                    user_id: currentUser.uid,
                    seller_id: sellerId,
                    qr_id: qr_id || null,
                    payment_mode,
                    reason,
                    order_id: order.id,
                    amount: amountPaise,
                    currency: "INR",
                    status: "created",
                    created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                });

                // ------------------------------
                // Response
                // ------------------------------
                return res.status(200).json({
                    success: true,
                    order_id: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    key_id: key_id,
                });

            } catch (error: any) {
                console.error("User Razorpay order creation error:", error);
                return res.status(500).json({
                    error: "Failed to create Razorpay order"
                });
            }
        });
    }
);
