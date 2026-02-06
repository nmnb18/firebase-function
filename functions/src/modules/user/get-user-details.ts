import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface GetUserDetailsInput {
    uid: string;
}

interface GetUserDetailsOutput {
    success: boolean;
    user: Record<string, any>;
}

export const getUserDetails = createCallableFunction<GetUserDetailsInput, GetUserDetailsOutput>(
    async (data, auth, context) => {
        try {
            if (!auth?.uid) {
                throw new Error("Unauthorized");
            }

            const uid = data.uid;
            if (!uid) {
                throw new Error("UID required");
            }

            // GET MAIN USER DOC
            const userDoc = await db.collection("users").doc(uid).get();
            if (!userDoc.exists) {
                throw new Error("User not found");
            }

            const userData = userDoc.data();

            // GET CUSTOMER PROFILE
            const customerSnap = await db
                .collection("customer_profiles")
                .where("user_id", "==", uid)
                .limit(1)
                .get();

            let customerProfile = null;
            if (!customerSnap.empty) {
                customerProfile = customerSnap.docs[0].data();
            }

            return {
                success: true,
                user: {
                    ...userData,
                    ...(customerProfile ? { customer_profile: customerProfile } : {}),
                },
            };
        } catch (error: any) {
            console.error("getUserDetails error:", error);
            throw error;
        }
    },
    {
        region: "asia-south1",
        requireAuth: true
    }
);
