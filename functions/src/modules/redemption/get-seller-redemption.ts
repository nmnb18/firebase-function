import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { createCache } from "../../utils/cache";

const corsHandler = cors({ origin: true });
const cache = createCache();
export const getSellerRedemptions = functions.https.onRequest(
    { region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            try {
                const sellerUser = await authenticateUser(req.headers.authorization);

                // Get query parameters
                const { status, limit = 50, offset = 0 } = req.query;
                const cacheKey = `seller_redemptions:${sellerUser.uid}_${status || 'all'}_${limit}_${offset}`;
                const cached = cache.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json(cached);
                }
                // Build query
                let query: any = db.collection("redemptions")
                    .where("seller_id", "==", sellerUser.uid)
                    .orderBy("created_at", "desc");
                if (status) {
                    query = query.where("status", "==", status);
                }
                // Parallelize main query and counts
                const [snapshot, pendingCountSnap, totalCountSnap] = await Promise.all([
                    query.limit(parseInt(limit as string)).offset(parseInt(offset as string)).get(),
                    db.collection("redemptions").where("seller_id", "==", sellerUser.uid).where("status", "==", "pending").count().get(),
                    db.collection("redemptions").where("seller_id", "==", sellerUser.uid).count().get(),
                ]);
                const redemptions = snapshot.docs.map((doc: any) => ({
                    id: doc.id,
                    ...doc.data(),
                    created_at: doc.data().created_at?.toDate?.() || doc.data().created_at,
                    expires_at: doc.data().expires_at?.toDate?.() || doc.data().expires_at,
                    redeemed_at: doc.data().redeemed_at?.toDate?.() || doc.data().redeemed_at
                }));
                const responseData = {
                    success: true,
                    redemptions: redemptions,
                    stats: {
                        pending: pendingCountSnap.data().count,
                        total: totalCountSnap.data().count,
                    },
                };
                cache.set(cacheKey, responseData, 30000);
                return res.status(200).json(responseData);
            } catch (err: any) {
                console.error("getSellerRedemptions error:", err);
                return res.status(err.statusCode ?? 500).json({ error: err.message });
            }
        });
    }
);