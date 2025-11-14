import * as functions from "firebase-functions";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const confirmPasswordReset = functions.https.onRequest({ secrets: ["API_KEY"] }, (req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Only POST allowed" });
            }

            const { oobCode, newPassword } = req.body;

            if (!oobCode || !newPassword) {
                return res.status(400).json({
                    error: "oobCode and newPassword are required"
                });
            }

            const FIREBASE_API_KEY = process.env.API_KEY;

            if (!FIREBASE_API_KEY) {
                return res.status(500).json({ error: "Missing API Key in env" });
            }

            // 🔥 Call Firebase REST API to verify + update password
            const response = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${FIREBASE_API_KEY}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        oobCode,
                        newPassword
                    }),
                }
            );

            const data = await response.json() as any;

            if (data.error) {
                const message = data.error.message;

                if (message === "INVALID_OOB_CODE") {
                    return res.status(400).json({ error: "Invalid or expired reset link" });
                }

                if (message === "EXPIRED_OOB_CODE") {
                    return res.status(400).json({ error: "Reset link has expired" });
                }

                return res.status(500).json({ error: message });
            }

            return res.status(200).json({
                success: true,
                message: "Password reset successful",
                email: data.email
            });

        } catch (err: any) {
            console.error("confirmPasswordReset Error:", err);
            return res.status(500).json({
                error: "Failed to reset password"
            });
        }
    });
});
