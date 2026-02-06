import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface GetTodayOfferStatusInput {
    seller_id: string;
}

interface GetTodayOfferStatusOutput {
    claimed: boolean;
    status: string | null;
    redeem_code: string | null;
}

export const getTodayOfferStatus = createCallableFunction<GetTodayOfferStatusInput, GetTodayOfferStatusOutput>(
    async (data, auth, context) => {
        try {
            if (!auth?.uid) {
                throw new Error("Unauthorized");
            }

            const { seller_id } = data;
            const today = new Date().toISOString().slice(0, 10);
            const claimId = `${auth!.uid}_${seller_id}_${today}`;

            const snap = await db
                .collection("today_offer_claims")
                .doc(claimId)
                .get();

            return {
                claimed: snap.exists,
                status: snap.exists ? snap.data()?.status : null,
                redeem_code: snap.exists ? snap.data()?.redeem_code : null
            };
        } catch (err: any) {
            console.error("getTodayOfferStatus error:", err);
            throw err;
        }
    },
    {
        region: "asia-south1",
        requireAuth: true
    }
);
