import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

/**
 * Seller dashboard stats
 * - requires Authorization Bearer token (authenticateUser) which should set req.currentUser
 * - returns:
 *   {
 *     total_users: number,        // distinct users who scanned this seller (based on scans collection)
 *     active_qr_codes: number,    // qr_codes where seller_id == sellerId and active == true
 *     total_scanned: number,      // total scans for this seller
 *     total_points_issued: number,// sum of points awarded for scans for this seller
 *     total_redemptions: number,  // count of redemptions for this seller (if you use 'redemptions' collection)
 *     seller_id: string,
 *     seller_name?: string
 *   }
 */
export const sellerStats = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Only GET allowed" });
            }

            // authenticate
            const currentUser = await authenticateUser(req.headers.authorization);
            // authenticateUser in your middleware likely ends response on failure; 
            // assume it sets req.currentUser (adjust if your function works differently)
            //const currentUser = (req as any).currentUser;
            if (!currentUser || !currentUser.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            //const sellerId = currentUser.uid; // assuming seller user id equals seller doc id
            // If your seller auth is different (token contains sellerId in a different field), adjust accordingly.


            // 1) get seller doc for name & config
            // Get seller profile
            const profilesRef = db.collection('seller_profiles');
            const profileQuery = await profilesRef
                .where('user_id', '==', currentUser.uid)
                .limit(1)
                .get();

            if (profileQuery.empty) {
                res.status(404).json({ error: "Seller profile not found" });
                return;
            }

            const profileDoc = profileQuery.docs[0];
            const sellerId = profileDoc.id;
            const sellerData = profileDoc.data();

            const results: any = {
                total_users: 0,
                active_qr_codes: 0,
                total_scanned: 0,
                total_points_issued: 0,
                total_redemptions: 0,
                seller_id: sellerId,
                seller_name: undefined
            };

            results.seller_name = sellerData?.business.shop_name ?? null;

            // 2) active_qr_codes
            const qrQ = await db.collection("qr_codes")
                .where("seller_id", "==", sellerId)
                .get();
            results.total_qrs = qrQ.size;

            // 3) scans: total_scanned, total_points_issued, distinct users
            // Use `transactions` where transaction_type == 'earn'
            const txQ = await db.collection("transactions")
                .where("seller_id", "==", sellerId)
                .where("transaction_type", "==", "earn")
                .get();

            results.total_scanned = txQ.size;

            let pointsSum = 0;
            const userSet = new Set<string>();

            txQ.forEach((doc) => {
                const d = doc.data();
                if (d?.points) pointsSum += Number(d.points) || 0;
                if (d?.user_id) userSet.add(d.user_id);
            });

            results.total_points_issued = pointsSum;
            results.total_users = userSet.size;

            // 4) redemptions (if you have 'redemptions' collection)
            // If you store redemptions differently, adjust this query to your schema
            let redemptionsCount = 0;
            try {
                const redQ = await db.collection("redemptions")
                    .where("seller_id", "==", sellerId)
                    .get();
                redemptionsCount = redQ.size;
            } catch (e) {
                // ignore if collection doesn't exist yet
                redemptionsCount = 0;
            }
            results.total_redemptions = redemptionsCount;

            // 5) LAST 5 SCANS  ---------------------------------------
            const lastFiveQ = await db.collection("transactions")
                .where("seller_id", "==", sellerId)
                .where("transaction_type", "==", "earn")
                .orderBy("timestamp", "desc")
                .limit(5)
                .get();
            results.last_five_scans = lastFiveQ.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));


            // 6) TODAY’S STATS ---------------------------------------
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayScansQ = await db.collection("scans")
                .where("seller_id", "==", sellerId)
                .where("transaction_type", "==", "earn")
                .where("timestamp", ">=", today)
                .get();

            let todayPoints = 0;

            todayScansQ.forEach(doc => {
                const d = doc.data();
                todayPoints += Number(d.points || 0);
            });

            results.today = {
                scans: todayScansQ.size,
                points: todayPoints,
            };

            results.subscription_tier = sellerData?.subscription.tier || "free";
            results.locked_features = (results.subscription_tier === "free");
            return res.status(200).json({ success: true, data: results });
        } catch (error: any) {
            console.error("sellerStats error:", error);
            return res.status(500).json({ error: error.message || "Server error" });
        }
    });
});
