import { createCallableFunction, validators, validationErrors } from "../../utils/callable";

export const requestPasswordReset = createCallableFunction<
    { email: string },
    { success: boolean; message: string }
>(
    async (data) => {
        const { email } = data;

        if (!email) {
            throw new Error("Email is required");
        }

        if (!validators.isEmail(email)) {
            throw new Error(validationErrors.invalidEmail);
        }

        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            throw new Error("Missing Firebase API Key");
        }

        const payload = {
            requestType: "PASSWORD_RESET",
            email,
        };

        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }
        );

        const responseData = (await response.json()) as any;

        if (responseData.error) {
            throw new Error(responseData.error.message);
        }

        return {
            success: true,
            message: "Password reset email sent.",
        };
    },
    { region: "asia-south1", requireAuth: false, secrets: ["API_KEY"] }
);
