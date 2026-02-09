// firebase-functions/src/redemption/getUserRedemptions.ts
import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { createCache } from "../../utils/cache";

const corsHandler = cors({ origin: true });
const cache = createCache();
export const getUserRedemptions = functions.https.onRequest(
    { region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            try {
                const currentUser = await authenticateUser(req.headers.authorization);
                // Get query parameters
                const { seller_id } = req.query;
                const cacheKey = `user_redemptions:${currentUser.uid}_${seller_id || 'all'}`;
                const cached = cache.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json(cached);
                }
                // Build base query - NO LIMIT
                let query: any = db.collection("redemptions")
                    .where("user_id", "==", currentUser.uid)
                    .orderBy("created_at", "desc");
                if (seller_id) {
                    query = query.where("seller_id", "==", seller_id);
                }
                const snapshot = await query.get();
                const redemptions = snapshot.docs.map((doc: any) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        redemption_id: data.redemption_id,
                        seller_id: data.seller_id,
                        seller_name: data.seller_name,
                        seller_shop_name: data.seller_shop_name,
                        user_id: data.user_id,
                        points: data.points,
                        status: data.status,
                        offer_id: data.offer_id,
                        offer_name: data.offer_name,
                        qr_data: data.qr_data,
                        qr_image_url: data.qr_image_url,
                        created_at: data.created_at?.toDate?.() || data.created_at,
                        updated_at: data.updated_at?.toDate?.() || data.updated_at,
                        redeemed_at: data.redeemed_at?.toDate?.() || data.redeemed_at,
                        expires_at: data.expires_at?.toDate?.() || data.expires_at,
                        metadata: data.metadata || {}
                    };
                });
                const stats = {
                    total: redemptions.length,
                    pending: redemptions.filter((r: { status: string; }) => r.status === 'pending').length,
                    redeemed: redemptions.filter((r: { status: string; }) => r.status === 'redeemed').length,
                    cancelled: redemptions.filter((r: { status: string; }) => r.status === 'cancelled').length,
                    expired: redemptions.filter((r: { status: string; }) => r.status === 'expired').length,
                    total_points: redemptions.reduce((sum: any, r: { points: any; }) => sum + (r.points || 0), 0),
                    redeemed_points: redemptions
                        .filter((r: { status: string; }) => r.status === 'redeemed')
                        .reduce((sum: any, r: { points: any; }) => sum + (r.points || 0), 0),
                    pending_points: redemptions
                        .filter((r: { status: string; }) => r.status === 'pending')
                        .reduce((sum: any, r: { points: any; }) => sum + (r.points || 0), 0),
                };
                const responseData = { success: true, redemptions, count: redemptions.length, stats };
                cache.set(cacheKey, responseData, 30000);
                return res.status(200).json(responseData);

            } catch (error: any) {
                console.error("Get user redemptions error:", error);

                // Handle specific Firestore errors
                if (error.code === 9) { // FAILED_PRECONDITION error
                    return res.status(400).json({
                        error: "Database query requires index. Please contact support."
                    });
                }

                return res.status(500).json({
                    error: error.message || "Failed to fetch redemptions"
                });
            }
        });
    });