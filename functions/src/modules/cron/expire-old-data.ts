import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, adminRef } from "../../config/firebase";

const BATCH_LIMIT = 500;

export const expireOldData = onSchedule(
    {
        schedule: "10 1 * * *", // 1:10 AM IST daily
        timeZone: "Asia/Kolkata",
        region: "asia-south1",
    },
    async () => {
        const now = new Date();

        try {
            await deleteStaleErrorLogs(now);
        } catch (err) {
            console.error("[expireOldData] deleteStaleErrorLogs failed:", err);
        }

        try {
            await deleteDeadPushTokens();
        } catch (err) {
            console.error("[expireOldData] deleteDeadPushTokens failed:", err);
        }

        console.log("[expireOldData] Done");
    }
);

/**
 * Delete resolved error_logs older than 90 days
 */
async function deleteStaleErrorLogs(now: Date): Promise<void> {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffTs = adminRef.firestore.Timestamp.fromDate(cutoff);

    const snap = await db
        .collection("error_logs")
        .where("created_at", "<", cutoffTs)
        .where("resolved", "==", true)
        .limit(BATCH_LIMIT)
        .get();

    if (snap.empty) {
        console.log("[expireOldData] No stale error_logs to delete");
        return;
    }

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[expireOldData] Deleted ${snap.size} stale error_logs`);
}

/**
 * Delete push_tokens where failed_count > 5 (DeviceNotRegistered / stale devices)
 */
async function deleteDeadPushTokens(): Promise<void> {
    const snap = await db
        .collection("push_tokens")
        .where("failed_count", ">", 5)
        .limit(BATCH_LIMIT)
        .get();

    if (snap.empty) {
        console.log("[expireOldData] No dead push tokens to delete");
        return;
    }

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[expireOldData] Deleted ${snap.size} dead push tokens`);
}
