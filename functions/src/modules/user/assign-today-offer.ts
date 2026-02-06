import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface AssignTodayOfferInput {
    seller_id: string;
}

interface AssignTodayOfferOutput {
    success: boolean;
    alreadyAssigned?: boolean;
    offer: any;
}

export const assignTodayOffer = createCallableFunction<AssignTodayOfferInput, AssignTodayOfferOutput>(
    async (data, auth, context) => {
        try {
            if (!auth?.uid) {
                throw new Error("Unauthorized");
            }

            const { seller_id } = data;
            if (!seller_id) {
                throw new Error("seller_id required");
            }

            const sellerSnap = await db
                .collection("seller_profiles")
                .doc(seller_id)
                .get();

            if (!sellerSnap.exists) {
                throw new Error("Seller not found");
            }

            const seller = sellerSnap.data();

            const userSnap = await db
                .collection("customer_profiles")
                .doc(auth!.uid)
                .get();

            if (!userSnap.exists) {
                throw new Error("User not found");
            }

            const user = sellerSnap.data();

            const today = new Date().toISOString().slice(0, 10);
            const claimId = `${auth!.uid}_${seller_id}_${today}`;

            // Already selected → return existing
            const claimSnap = await db.collection("today_offer_claims").doc(claimId).get();
            if (claimSnap.exists) {
                return {
                    success: true,
                    alreadyAssigned: true,
                    offer: claimSnap.data()
                };
            }

            // Fetch seller offers
            const doc = await db.collection("seller_daily_offers")
                .doc(`${seller_id}_${today}`)
                .get();

            if (!doc.exists) {
                throw new Error("No offers configured for today");
            }

            const offers = doc.data()?.offers || [];
            if (!offers.length) {
                throw new Error("No offers available");
            }

            // Random secure selection
            const randomIndex = Math.floor(Math.random() * offers.length);
            const selected = offers[randomIndex];
            await db.collection("today_offer_claims").doc(claimId).set({
                offer_id: selected.id,
                title: selected.title,
                min_spend: selected.min_spend,
                terms: selected.terms,
                seller_id,
                user_id: auth!.uid,
                date: today,
                status: 'ASSIGNED',
                redeemed: false,
                created_at: new Date(),
                shop_name: seller?.business?.shop_name || "Unknown Store",
                seller_logo: seller?.media?.logo_url || "",
                customer_name: user?.account.name,
                customer_contact: user?.account.phone
            });

            return { success: true, offer: selected };
        } catch (err: any) {
            console.error("assignTodayOffer error:", err);
            throw err;
        }
    },
    {
        region: "asia-south1",
        requireAuth: true
    }
);
