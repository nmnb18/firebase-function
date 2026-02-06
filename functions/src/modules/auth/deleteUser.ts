import { createCallableFunction } from "../../utils/callable";
import { db, adminRef } from "../../config/firebase";

export const deleteUser = createCallableFunction<{}, { success: boolean; message: string }>(
    async (data, auth, context) => {
        const userId = context.auth.uid;
        const now = adminRef.firestore.FieldValue.serverTimestamp();

        // 1️⃣ PARALLEL: Soft delete profiles + disable QR codes
        const qrSnap = await db.collection("qr_codes")
            .where("used_by", "==", userId)
            .get();

        const batch = db.batch();
        qrSnap.forEach(doc => {
            batch.update(doc.ref, { disabled_for_user: true });
        });

        // Parallel operations: mark as deleted + batch update QR + batch commit
        await Promise.all([
            db.collection("users").doc(userId).update({
                deleted: true,
                deleted_at: now,
            }),
            db.collection("customer_profiles").doc(userId).update({
                deleted: true,
                deleted_at: now,
            }),
            batch.commit()
        ]);

        // 2️⃣ Delete Firebase Auth user (final step, after data is soft-deleted)
        await adminRef.auth().deleteUser(userId);

        return {
            success: true,
            message: "User account deleted safely",
        };
    },
    { region: "asia-south1", requireAuth: true }
);

