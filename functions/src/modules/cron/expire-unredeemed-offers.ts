import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../../config/firebase";
import admin from "firebase-admin";

export const expireUnredeemedOffers = onSchedule(
    {
        schedule: "5 0 * * *", // 12:05 AM daily
        //schedule: "0 7 * * *",
        timeZone: "Asia/Kolkata",
    },
    async () => {
        try {
            const date = new Date();
            date.setDate(date.getDate() - 1);
            const yesterday = date.toISOString().slice(0, 10); // YYYY-MM-DD

            console.log("Running expiry for:", yesterday);

            const claimsSnap = await db
                .collection("today_offer_claims")
                .where("date", "==", yesterday)
                .where("redeemed", "==", false)
                .get();

            if (claimsSnap.empty) {
                console.log("No claims to expire");
                return;
            }

            const batch = db.batch();

            for (const claimDoc of claimsSnap.docs) {
                const claim = claimDoc.data();

                // Update today_offer_claims
                batch.update(claimDoc.ref, {
                    status: "EXPIRED",
                    expired_at: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Update related offer_redemptions
                const redemptionSnap = await db
                    .collection("offer_redemptions")
                    .where("user_id", "==", claim.user_id)
                    .where("seller_id", "==", claim.seller_id)
                    .where("date", "==", yesterday)
                    .where("status", "==", "PENDING")
                    .get();

                redemptionSnap.docs.forEach((doc) => {
                    batch.update(doc.ref, {
                        status: "EXPIRED",
                        expired_at: admin.firestore.FieldValue.serverTimestamp(),
                    });
                });
            }

            await batch.commit();
            console.log(`Expired ${claimsSnap.size} claims`);
        } catch (error) {
            console.error("expireUnredeemedOffers error:", error);
        }
    }
);
