import { createCallableFunction } from "../../utils/callable";
import { auth as firebaseAuth } from "../../config/firebase";

export const changePassword = createCallableFunction<
  { newPassword: string },
  { success: boolean; message: string }
>(
  async (data, auth) => {
    const { newPassword } = data;

    if (!newPassword) {
      throw new Error("New password required");
    }

    if (newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    // Update password in Firebase Auth
    await firebaseAuth.updateUser(auth!.uid, { password: newPassword });

    return {
      success: true,
      message: "Password updated successfully",
    };
  },
  { region: "asia-south1", requireAuth: true }
);
