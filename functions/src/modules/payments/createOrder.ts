import * as functions from "firebase-functions";
import Razorpay from "razorpay";
import cors from "cors";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

// 🔐 Use Razorpay keys from Firebase secret manager
export const createOrder = functions.https.onRequest(
    { secrets: ["RAZORPAY_ENV", "RAZORPAY_KEY_ID_TEST", "RAZORPAY_SECRET_TEST"] },
    async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Only POST allowed" });
            }

            try {
                const { planId, sellerId } = req.body;

                // authenticate
                const currentUser = await authenticateUser(req.headers.authorization);
                // authenticateUser in your middleware likely ends response on failure; 
                // assume it sets req.currentUser (adjust if your function works differently)
                //const currentUser = (req as any).currentUser;
                if (!currentUser || !currentUser.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                if (!planId || !sellerId) {
                    return res.status(400).json({ error: "Missing required fields" });
                }

                // Amount (in paise)
                const plans: Record<string, number> = {
                    pro: 29900,       // ₹299.00
                    premium: 299900,  // ₹2999.00
                };
                const amount = plans[planId] ?? 29900;

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

                const options = {
                    amount,
                    currency: "INR",
                    receipt: `GBT-ORD-${sellerId.slice(0, 6)}-${Date.now().toString().slice(-6)}`,
                };

                const order = await razorpay.orders.create(options);

                // Store pending order
                await db.collection("payments").doc(order.id).set({
                    sellerId,
                    planId,
                    amount,
                    order_id: order.id,
                    currency: "INR",
                    status: "created",
                    created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                });

                return res.status(200).json({
                    success: true,
                    order_id: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    key_id: key_id,
                });
            } catch (error: any) {
                console.error("Razorpay order creation error:", error);
                return res.status(500).json({ error: "Failed to create Razorpay order" });
            }
        });
    }
);
