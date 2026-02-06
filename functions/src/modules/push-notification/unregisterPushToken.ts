import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface UnregisterPushTokenInput {
    push_token: string;
}
interface UnregisterPushTokenOutput {
    success: boolean;
}

export const unregisterPushToken = createCallableFunction<UnregisterPushTokenInput, UnregisterPushTokenOutput>(
    async (data, auth, context) => {
        try {
            const userId = auth!.uid;
            const { push_token } = data;

            if (!push_token) {
                throw new functions.https.HttpsError('invalid-argument', 'Token required');
            }

            const snapshot = await db
                .collection("push_tokens")
                .where("user_id", "==", userId)
                .where("token", "==", push_token)
                .get();

            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            return { success: true };
        } catch (err) {
            throw new functions.https.HttpsError('internal', 'Failed to unregister push token');
        }
    },
    {
        region: 'asia-south1',
        requireAuth: true
    }
);
