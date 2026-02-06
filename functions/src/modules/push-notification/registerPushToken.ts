import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface RegisterPushTokenInput {
    push_token: string;
    platform?: string;
    device_name?: string;
    device_model?: string;
}
interface RegisterPushTokenOutput {
    success: boolean;
}

export const registerPushToken = createCallableFunction<RegisterPushTokenInput, RegisterPushTokenOutput>(
    async (data, auth, context) => {
        try {
            const userId = auth!.uid;

            const {
                push_token,
                platform,
                device_name,
                device_model,
            } = data;

            if (!push_token) {
                throw new functions.https.HttpsError('invalid-argument', 'Push token missing');
            }

            // Avoid duplicates
            const existing = await db
                .collection("push_tokens")
                .where("user_id", "==", userId)
                .where("token", "==", push_token)
                .get();

            if (!existing.empty) {
                return { success: true };
            }

            await db.collection("push_tokens").add({
                user_id: userId,
                token: push_token,
                platform,
                device_name,
                device_model,
                created_at: new Date(),
                updated_at: new Date(),
            });

            return { success: true };
        } catch (err) {
            console.error(err);
            throw new functions.https.HttpsError('internal', 'Failed to register push token');
        }
    },
    {
        region: 'asia-south1',
        requireAuth: true
    }
);
