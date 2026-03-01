import * as functions from "firebase-functions";
import cors from "cors";

const corsHandler = cors({ origin: true });

type AuthResponse = {
    refresh_token: string;
    expires_in: string;
    user_id: string;
    id_token: string;
    error?: { message: string };
}

export const refreshToken = functions.https.onRequest(
    { secrets: ["API_KEY"], region: "asia-south1", timeoutSeconds: 10, memory: '128MiB' },
    async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            const { refreshToken } = req.body;
            if (!refreshToken) {
                return res.status(400).json({ error: "Missing refreshToken" });
            }

            try {
                const FIREBASE_API_KEY = process.env.API_KEY;
                const url = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
                const params = new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token: refreshToken,
                });

                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: params.toString(),
                });

                const data = await response.json() as AuthResponse;

                if (data.error) {
                    return res.status(400).json({ error: data.error.message });
                }

                return res.status(200).json({
                    success: true,
                    idToken: data.id_token,
                    refreshToken: data.refresh_token,
                    expiresIn: data.expires_in,
                    userId: data.user_id,
                });
            } catch (err: any) {
                console.error("Token refresh error:", err);
                return res.status(err.statusCode ?? 500).json({ error: "Internal server error" });
            }
        });
    }
);
