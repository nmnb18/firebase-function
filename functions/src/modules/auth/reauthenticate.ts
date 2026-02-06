import { createCallableFunction } from "../../utils/callable";
import { auth as firebaseAuth } from "../../config/firebase";

export const reauthenticate = createCallableFunction<
    { currentPassword: string },
    { success: boolean }
>(
    async (data, auth) => {
        const { currentPassword } = data;

        if (!currentPassword) {
            throw new Error("Current password required");
        }

        const email = auth?.email;
        if (!email) {
            throw new Error("Email not found");
        }

        const API_KEY = process.env.API_KEY;
        if (!API_KEY) {
            throw new Error("Missing API Key");
        }

        // Validate password by trying to sign in
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password: currentPassword,
                    returnSecureToken: false,
                }),
            }
        );

        const result = (await response.json()) as any;

        if (result.error) {
            throw new Error("Incorrect password");
        }

        return { success: true };
    },
    { region: "asia-south1", requireAuth: true, secrets: ["API_KEY"] }
);
