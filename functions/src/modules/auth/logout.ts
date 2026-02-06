import { createCallableFunction } from "../../utils/callable";
import { auth as firebaseAuth } from "../../config/firebase";

export const logout = createCallableFunction<{ uid: string }, { success: boolean }>(
    async (data) => {
        const { uid } = data;

        if (!uid) {
            throw new Error("UID is required");
        }

        // Revoke all refresh tokens for the user
        await firebaseAuth.revokeRefreshTokens(uid);

        return {
            success: true,
        };
    },
    { region: "asia-south1", requireAuth: true }
);
