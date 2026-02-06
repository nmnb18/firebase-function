import { createCallableFunction, validators } from "../../utils/callable";

export const confirmPasswordReset = createCallableFunction<
  { oobCode: string; newPassword: string },
  { success: boolean; message: string; email: string }
>(
  async (data) => {
    const { oobCode, newPassword } = data;

    if (!oobCode || !newPassword) {
      throw new Error("oobCode and newPassword are required");
    }

    if (newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const FIREBASE_API_KEY = process.env.API_KEY;
    if (!FIREBASE_API_KEY) {
      throw new Error("Missing API Key in env");
    }

    // Call Firebase REST API to verify + update password
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oobCode,
          newPassword,
        }),
      }
    );

    const responseData = (await response.json()) as any;

    if (responseData.error) {
      const message = responseData.error.message;

      if (message === "INVALID_OOB_CODE") {
        throw new Error("Invalid or expired reset link");
      }

      if (message === "EXPIRED_OOB_CODE") {
        throw new Error("Reset link has expired");
      }

      throw new Error(message);
    }

    return {
      success: true,
      message: "Password reset successful",
      email: responseData.email,
    };
  },
  { region: "asia-south1", requireAuth: false, secrets: ["API_KEY"] }
);
