import { createCallableFunction } from "../../utils/callable";
import { db, adminRef } from "../../config/firebase";

export const deleteSellerAccount = createCallableFunction<{}, { success: boolean; message: string }>(
  async (data, auth, context) => {
    const sellerId = context.auth.uid;
    const now = adminRef.firestore.FieldValue.serverTimestamp();

    // 1️⃣ PARALLEL: Mark seller as deleted + cancel subscription
    const [qrSnap] = await Promise.all([
      db.collection("qr_codes").where("seller_id", "==", sellerId).get(),
      db.collection("seller_profiles").doc(sellerId).update({
        deleted: true,
        deleted_at: now,
        status: "closed",
      }),
      db.collection("seller_subscriptions").doc(sellerId).update({
        status: "cancelled",
        cancelled_at: now,
      })
    ]);

    // 2️⃣ Deactivate all QR codes
    const batch = db.batch();
    qrSnap.forEach(doc => {
      batch.update(doc.ref, {
        status: "inactive",
        deactivated_at: now,
      });
    });

    // 3️⃣ Commit batch + Delete Firebase Auth user
    await Promise.all([
      batch.commit(),
      adminRef.auth().deleteUser(sellerId)
    ]);

    return {
      success: true,
      message: "Seller account deleted safely",
    };
  },
  { region: "asia-south1", requireAuth: true }
);

