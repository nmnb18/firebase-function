import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";


const corsHandler = cors({ origin: true });

export const getTodayOfferStatus = functions.https.onRequest({ region: "asia-south1", }, (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const { seller_id } = req.query;
            const today = new Date().toISOString().slice(0, 10);
            const claimId = `${currentUser.uid}_${seller_id}_${today}`;

            const snap = await db
                .collection("today_offer_claims")
                .doc(claimId)
                .get();

            return res.status(200).json({
                claimed: snap.exists,
                status: snap.exists ? snap.data()?.status : null,
                redeem_code: snap.exists ? snap.data()?.redeem_code : null
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });
});
