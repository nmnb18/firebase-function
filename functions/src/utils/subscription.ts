import { adminRef, db } from "../config/firebase";
import { getSubscriptionEndDate } from "./helper";

export async function enforceSubscriptionStatus(profile: any, sellerId: string) {
    const sub = profile.subscription;

    // If no subscription object → skip
    if (!sub || !sub.expiry) return profile;

    const now = adminRef.firestore.Timestamp.now();
    const expiry = sub.expiry;

    if (expiry.toMillis() <= now.toMillis() && sub.tier !== "free") {

        const updatedSub = {
            ...sub,
            tier: "free",
            expires_at: getSubscriptionEndDate(),
            monthly_limit: 300,
            updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
        };

        // Write new subscription object
        await db.collection("seller_profiles").doc(sellerId).update({
            subscription: updatedSub
        });

        return {
            ...profile,
            subscription: updatedSub
        };
    }

    return profile; // still active
}
