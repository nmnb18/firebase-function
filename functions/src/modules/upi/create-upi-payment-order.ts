import { Request, Response } from "express";
import Razorpay from "razorpay";
import cors from "cors";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

/**
 * POST /createUPIPaymentOrder
 *
 * Creates a Razorpay order and persists a pending record in Firestore.
 * The client uses the returned order_id + key_id to launch the Razorpay SDK.
 *
 * Body: { seller_id: string, amount: number }   ← amount in paise (integer)
 * Auth: Firebase JWT required (user token)
 */
export const createUPIPaymentOrderHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "POST only" });
        }

        try {
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const { seller_id, amount } = req.body;

            if (!seller_id || typeof seller_id !== "string") {
                return res.status(400).json({ error: "seller_id is required" });
            }
            if (!amount || typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
                return res.status(400).json({ error: "amount must be a positive integer (paise)" });
            }

            // Fetch seller to confirm existence and get shop name
            const sellerDoc = await db.collection("seller_profiles").doc(seller_id).get();
            if (!sellerDoc.exists) {
                return res.status(404).json({ error: "Seller not found" });
            }
            const sellerData = sellerDoc.data()!;

            // Initialise Razorpay with env-switched keys
            const env = process.env.RAZORPAY_ENV || "test";
            const key_id =
                env === "live"
                    ? process.env.RAZORPAY_KEY_ID_LIVE!
                    : process.env.RAZORPAY_KEY_ID_TEST!;
            const key_secret =
                env === "live"
                    ? process.env.RAZORPAY_SECRET_LIVE!
                    : process.env.RAZORPAY_SECRET_TEST!;

            const razorpay = new Razorpay({ key_id, key_secret });

            const order = await razorpay.orders.create({
                amount,
                currency: "INR",
                receipt: `upi_${currentUser.uid.slice(0, 8)}_${Date.now()}`,
            });

            // Persist pending order in Firestore
            await db.collection("upi_payment_orders").doc(order.id).set({
                order_id: order.id,
                user_id: currentUser.uid,
                seller_id,
                amount,
                currency: "INR",
                status: "pending",
                created_at: adminRef.firestore.FieldValue.serverTimestamp(),
            });

            return res.status(200).json({
                order_id: order.id,
                key_id,
                amount: order.amount,
                currency: order.currency,
                seller_name: sellerData.business?.shop_name || "",
            });
        } catch (error: any) {
            console.error("createUPIPaymentOrder error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    });
};
