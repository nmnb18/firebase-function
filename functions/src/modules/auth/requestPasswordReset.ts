import * as functions from "firebase-functions";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const requestPasswordReset = functions.https.onRequest({ secrets: ["API_KEY"], region: "asia-south1", timeoutSeconds: 10, memory: '128MiB' }, (req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Only POST allowed" });
            }

            const { email } = req.body;

            if (!email) {
                return res.status(400).json({ error: "Email is required" });
            }

            const apiKey = process.env.API_KEY;
            if (!apiKey) {
                return res.status(500).json({ error: "Missing Firebase API Key" });
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
                    body: JSON.stringify(payload)
                }
            );

            const data = await response.json() as any;

            if (data.error) {
                return res.status(400).json({ error: data.error.message });
            }

            return res.status(200).json({
                success: true,
                message: "Password reset email sent."
            });

        } catch (err: any) {
            return res.status(err.statusCode ?? 500).json({ error: err.message });
        }
    });
});
