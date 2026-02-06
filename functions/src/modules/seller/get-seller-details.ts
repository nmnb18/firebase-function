import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";
import { generateCacheKey, cacheManager } from "../../utils/performance";
import { enforceSubscriptionStatus } from "../../utils/subscription";

interface GetSellerDetailsRequest {
    uid: string;
}

export const getSellerDetails = createCallableFunction<GetSellerDetailsRequest, any>(
    async (data, auth, context) => {
        const { uid } = data;

        if (!auth?.uid) {
            throw new Error("Unauthorized");
        }

        if (!uid) {
            throw new Error("UID is required");
        }

        // Check cache first
        const cacheKey = generateCacheKey("sellerDetails", { uid });
        const cached = cacheManager.get(cacheKey);
        if (cached) return cached;

        // Parallel fetches
        const [userDoc, sellerSnap] = await Promise.all([
            db.collection("users").doc(uid).get(),
            db
                .collection("seller_profiles")
                .where("user_id", "==", uid)
                .limit(1)
                .get(),
        ]);

        if (!userDoc.exists) {
            throw new Error("User not found");
        }

        const userData = userDoc.data();

        let sellerProfile = null;
        if (!sellerSnap.empty) {
            const tempSellerProfile = sellerSnap.docs[0].data();
            sellerProfile = await enforceSubscriptionStatus(tempSellerProfile, auth.uid);
        }

        const result = {
            user: {
                ...userData,
                ...(sellerProfile ? { seller_profile: sellerProfile } : {}),
            },
        };

        // Cache for 10 minutes
        cacheManager.set(cacheKey, result, 600);

        return result;
    },
    { region: "asia-south1", requireAuth: true }
);
