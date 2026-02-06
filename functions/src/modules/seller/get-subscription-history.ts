import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

export const getSubscriptionHistory = createCallableFunction<void, any>(
    async (_, auth) => {
        const sellerId = auth!.uid;

        // Get subscription history from Firestore
        const historySnapshot = await db
            .collection("subscription_history")
            .doc(sellerId)
            .collection("records")
            .orderBy("paid_at", "desc")
            .get();

        if (historySnapshot.empty) {
            return {
                success: true,
                history: [],
                message: "No subscription history found",
            };
        }

        const history = historySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

        return {
            success: true,
            history,
            total: history.length,
        };
    },
    { region: "asia-south1", requireAuth: true }
);