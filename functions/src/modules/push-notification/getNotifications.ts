import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface GetNotificationsInput {
    limit?: number;
    unread?: boolean;
}
interface GetNotificationsOutput {
    success: boolean;
    notifications: any[];
    total: number;
}

export const getNotifications = createCallableFunction<GetNotificationsInput, GetNotificationsOutput>(
    async (data, auth, context) => {
        try {
            const userId = auth!.uid;

            // Optional query params
            const limit = data.limit || 50;
            const unreadOnly = data.unread || false;

            let query = db
                .collection("user_notifications")
                .doc(userId)
                .collection("notifications")
                .orderBy("created_at", "desc")
                .limit(limit);

            if (unreadOnly) query = query.where("read", "==", false);

            const snap = await query.get();

            const notifications = snap.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                created_at: doc.data()?.created_at?.toDate?.() || null,
            }));

            return { success: true, notifications, total: notifications.length };
        } catch (err: any) {
            console.error("getUserNotifications Error:", err);
            throw new functions.https.HttpsError('internal', err.message || 'Internal server error');
        }
    },
    {
        region: 'asia-south1',
        requireAuth: true
    }
);
