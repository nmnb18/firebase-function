import { db, adminRef } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";

interface UpdateUserProfileInput {
    section: string;
    data: Record<string, any>;
}

interface UpdateUserProfileOutput {
    success: boolean;
    message: string;
    updated: Record<string, any>;
    customer_profile: Record<string, any>;
}

export const updateUserProfile = createCallableFunction<UpdateUserProfileInput, UpdateUserProfileOutput>(
    async (data, auth, context) => {
        try {
            if (!auth || !auth.uid) {
                throw new Error("Unauthorized");
            }

            const { section, data: updateData } = data;

            if (!section || !updateData) {
                throw new Error("Missing required fields: section, data");
            }

            // Allowed updatable sections
            const validSections = [
                "account",
                "location",
            ];

            if (!validSections.includes(section)) {
                throw new Error(`Invalid section. Allowed: ${validSections.join(", ")}`);
            }

            const userId = auth!.uid;
            const userRef = db.collection("customer_profiles").doc(userId);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                throw new Error("Customer profile not found");
            }

            const customerProfile = userDoc.data() ?? {};

            // Prepare update payload
            let updatePayload: any = {
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
            };

            updatePayload[section] = {
                ...customerProfile[section],
                ...updateData
            };

            // Update DB
            await userRef.update(updatePayload);

            // Get updated document
            const updatedDoc = await userRef.get();
            const updatedData = updatedDoc.data();

            return {
                success: true,
                message: `${section} section updated successfully`,
                updated: updatePayload,
                customer_profile: updatedData || {}
            };
        } catch (error: any) {
            console.error("Update customer profile error:", error);
            throw error;
        }
    },
    {
        region: "asia-south1",
        requireAuth: true
    }
);