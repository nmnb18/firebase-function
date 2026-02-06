import { createCallableFunction } from "../../utils/callable";
import { adminRef, db } from "../../config/firebase";
import { Redemption } from "../../types/redemption";

async function releasePointHold(redemptionId: string) {
    const holdsQuery = await db
        .collection("point_holds")
        .where("redemption_id", "==", redemptionId)
        .where("status", "==", "reserved")
        .limit(1)
        .get();

    if (!holdsQuery.empty) {
        await holdsQuery.docs[0].ref.update({
            status: "released",
            released_at: adminRef.firestore.FieldValue.serverTimestamp(),
        });
    }
}

interface MarkExpiredRequest {
    redemption_id: string;
}

export const markRedemptionAsExpired = createCallableFunction<
    MarkExpiredRequest,
    any
>(
    async (data, auth) => {
        const { redemption_id } = data;

        if (!redemption_id) {
            throw new Error("redemption_id is required");
        }

        // 1. Verify redemption exists
        const redemptionRef = db.collection("redemptions").doc(redemption_id);
        const redemptionDoc = await redemptionRef.get();

        if (!redemptionDoc.exists) {
            throw new Error("Redemption not found");
        }

        const redemption = redemptionDoc.data() as Redemption;

        // Update and release point hold in parallel
        await Promise.all([
            redemptionRef.update({
                status: "expired",
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    ...redemption.metadata,
                    seller_notes: "QR expired",
                },
            }),
            releasePointHold(redemption_id),
        ]);

        return {
            success: true,
        };
    },
    { region: "asia-south1", requireAuth: true }
);