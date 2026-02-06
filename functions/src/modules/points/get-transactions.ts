import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface GetTransactionsInput {
    limit?: number;
    type?: string;
    seller_id?: string;
}
interface TransactionItem {
    id: string;
    seller_id: string;
    seller_name: string;
    points: number;
    type: string;
    description: string;
    amount: number;
    created_at: string;
    qr_type?: string;
    metadata?: any;
}
type GetTransactionsOutput = TransactionItem[];

export const getTransactions = createCallableFunction<GetTransactionsInput, GetTransactionsOutput>(
    async (data, auth, context) => {
        try {
            const currentUser = { uid: auth!.uid };

            // Get query parameters
            const limit = data.limit || 10;
            const type = data.type; // Optional filter by type
            const sellerId = data.seller_id; // Optional filter by seller

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
                return [];
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

            return transactions;
        } catch (error: any) {
            console.error("Get transactions error:", error);
            throw new functions.https.HttpsError('internal', error.message);
        }
    },
    {
        region: 'asia-south1',
        requireAuth: true
    }
);