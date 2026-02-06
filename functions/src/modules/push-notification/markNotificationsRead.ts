import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface MarkNotificationsReadInput {
    notificationIds: string[];
}
interface MarkNotificationsReadOutput {
    success: boolean;
}

export const markNotificationsRead = createCallableFunction<MarkNotificationsReadInput, MarkNotificationsReadOutput>(
    async (data, auth, context) => {
        try {
            const userId = auth!.uid;
            const { notificationIds } = data;

            const batch = db.batch();
            const baseRef = db
                .collection("user_notifications")
                .doc(userId)
                .collection("notifications");

            notificationIds.forEach((id: string) => {
                batch.update(baseRef.doc(id), { read: true });
            });

            await batch.commit();

            return { success: true };
        } catch (err: any) {
            console.error("Mark read error", err);
            throw new functions.https.HttpsError('internal', err.message);
        }
    },
    {
        region: 'asia-south1',
        requireAuth: true
    }
);
