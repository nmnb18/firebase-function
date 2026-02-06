import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface GetUnreadNotificationCountInput {}
interface GetUnreadNotificationCountOutput {
  success: boolean;
  count: number;
}

export const getUnreadNotificationCount = createCallableFunction<GetUnreadNotificationCountInput, GetUnreadNotificationCountOutput>(
  async (data, auth, context) => {
    try {
      const userId = auth!.uid;

      const snap = await db
        .collection("user_notifications")
        .doc(userId)
        .collection("notifications")
        .where("read", "==", false)
        .get();

      return {
        success: true,
        count: snap.size,
      };
    } catch (err: any) {
      console.error("Unread count error", err);
      throw new functions.https.HttpsError('internal', err.message);
    }
  },
  {
    region: 'asia-south1',
    requireAuth: true
  }
);
