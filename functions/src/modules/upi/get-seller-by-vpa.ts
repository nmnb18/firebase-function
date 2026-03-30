import { Request, Response } from "express";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

/**
 * GET /getSellerByVPA?vpa=seller@bank
 *
 * Looks up a seller profile by UPI VPA so the user app can show seller
 * details and a points-preview before initiating payment.
 *
 * Auth: Firebase JWT required (user token)
 */
export const getSellerByVPAHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "GET only" });
        }

        try {
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const vpa = req.query.vpa as string;
            if (!vpa || !vpa.includes("@")) {
                return res.status(400).json({ error: "A valid UPI VPA is required (e.g. merchant@bank)" });
            }

            const snap = await db
                .collection("seller_profiles")
                .where("rewards.upi_ids", "array-contains", vpa)
                .limit(1)
                .get();

            if (snap.empty) {
                return res.status(404).json({
                    error: "Seller not found on Grabbitt",
                    code: "SELLER_NOT_FOUND",
                });
            }

            const doc = snap.docs[0];
            const data = doc.data();

            return res.status(200).json({
                seller_id: doc.id,
                shop_name: data.business?.shop_name || "",
                category: data.business?.category || "",
                reward_config: data.rewards || {},
            });
        } catch (error: any) {
            console.error("getSellerByVPA error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    });
};
