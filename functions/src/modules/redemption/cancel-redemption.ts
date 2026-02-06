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

interface CancelRedemptionRequest {
    redemption_id: string;
}

export const cancelRedemption = createCallableFunction<
    CancelRedemptionRequest,
    any
>(
    async (data, auth) => {
        const { redemption_id } = data;

        if (!redemption_id) {
            throw new Error("redemption_id is required");
        }

        // Get redemption
        const redemptionRef = db.collection("redemptions").doc(redemption_id);
        const redemptionDoc = await redemptionRef.get();

        if (!redemptionDoc.exists) {
            throw new Error("Redemption not found");
        }

        const redemption = redemptionDoc.data() as Redemption;

        // Check authorization (only user who created it can cancel)
        if (redemption.user_id !== auth!.uid) {
            throw new Error("Not authorized to cancel this redemption");
        }

        // Check if already processed
        if (redemption.status !== "pending") {
            throw new Error(
                `Cannot cancel - redemption already ${redemption.status}`
            );
        }

        // Update status and release point hold in parallel
        await Promise.all([
            redemptionRef.update({
                status: "cancelled",
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
            }),
            releasePointHold(redemption_id),
        ]);

        return {
            success: true,
            message: "Redemption cancelled successfully",
            redemption_id: redemption_id,
        };
    },
    { region: "asia-south1", requireAuth: true }
);