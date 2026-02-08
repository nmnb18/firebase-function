// firebase-functions/src/points/getTransactions.ts
import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { createCache } from "../../utils/cache";

const corsHandler = cors({ origin: true });
const cache = createCache();

export const getTransactions = functions.https.onRequest(
    { region: 'asia-south1', minInstances: 1, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            try {
                // Authenticate user
                const currentUser = await authenticateUser(req.headers.authorization);

                // Get query parameters
                const limit = parseInt(req.query.limit as string) || 10;
                const type = req.query.type as string; // Optional filter by type
                const sellerId = req.query.seller_id as string; // Optional filter by seller

                // Check cache (90s TTL)
                const cacheKey = `transactions:${currentUser.uid}_${limit}_${type || 'all'}_${sellerId || 'all'}`;
                const cached = cache.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json(cached);
                }

                // Build query
                let query = db.collection("transactions")
                    .where("user_id", "==", currentUser.uid)
                    .orderBy("timestamp", "desc")
                    .limit(limit);

                // Apply filters if provided
                if (type) {
                    query = query.where("transaction_type", "==", type);
                }

                if (sellerId) {
                    query = query.where("seller_id", "==", sellerId);
                }

                const transactionsSnapshot = await query.get();

                if (transactionsSnapshot.empty) {
                    const responseData: any[] = [];
                    cache.set(cacheKey, responseData, 90000);
                    return res.status(200).json(responseData);
                }

                const transactions = transactionsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        seller_id: data.seller_id,
                        seller_name: data.seller_name || "Unknown Store",
                        points: data.points || 0,
                        type: data.transaction_type || 'earn',
                        description: data.description || '',
                        amount: data.amount || 0,
                        created_at: data.timestamp?.toDate().toISOString() || new Date().toISOString(),
                        qr_type: data.qr_type,
                        // Add additional metadata
                        metadata: {
                            has_amount: !!data.amount,
                            is_reward: data.transaction_type === 'earn',
                            is_redemption: data.transaction_type === 'redeem',
                            is_payment: data.transaction_type === 'payment' || data.qr_type === 'payment'
                        }
                    };
                });

                // Cache result (90s TTL)
                cache.set(cacheKey, transactions, 90000);

                return res.status(200).json(transactions);

            } catch (error: any) {
                console.error("Get transactions error:", error);
                return res.status(500).json({ error: error.message });
            }
        });
    });