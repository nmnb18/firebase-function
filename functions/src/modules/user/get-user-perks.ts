import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface GetUserPerksInput {}

interface UserPerk {
    id: string;
    seller_id: string;
    shop_name: string;
    shop_logo_url: string;
    offer_id: string;
    offer_title: string;
    min_spend: number;
    terms: string;
    date: string;
    expiry_date: string;
    status: string;
    redeem_code: string | null;
    redeemed_at: any;
}

interface GetUserPerksOutput {
    success: boolean;
    count: number;
    perks: UserPerk[];
}

export const getUserPerks = createCallableFunction<GetUserPerksInput, GetUserPerksOutput>(
    async (data, auth, context) => {
        try {
            if (!auth?.uid) {
                throw new Error("Unauthorized");
            }

            const user_id = auth!.uid;

            // 1️⃣ Fetch claims
            const claimsSnap = await db
                .collection("today_offer_claims")
                .where("user_id", "==", user_id)
                .orderBy("created_at", "desc")
                .get();

            // 3️⃣ Normalize response
            const perks = claimsSnap.docs.map((doc) => {
                const claim = doc.data();

                return {
                    id: doc.id,
                    seller_id: claim.seller_id,
                    shop_name: claim.shop_name,
                    shop_logo_url: claim.seller_logo,
                    offer_id: claim.offer_id,
                    offer_title: claim.title,
                    min_spend: claim.min_spend,
                    terms: claim.terms,
                    date: claim.date,
                    expiry_date: `${claim.date}T23:59:59`, // EOD expiry
                    status: claim?.status || "CLAIMED",
                    redeem_code: claim?.redeem_code || null,
                    redeemed_at: claim?.created_at || null,
                };
            });

            return {
                success: true,
                count: perks.length,
                perks,
            };
        } catch (err: any) {
            console.error("getUserPerks error:", err);
            throw err;
        }
    },
    {
        region: "asia-south1",
        requireAuth: true
    }
);