import * as functions from "firebase-functions";
import { auth } from "../../config/firebase";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const reauthenticate = functions.https.onRequest(
    { secrets: ["API_KEY"], region: "asia-south1", },
    (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") {
                    return res.status(405).json({ error: "POST only" });
                }

                const { currentPassword } = req.body;
                const authHeader = req.headers.authorization;

                if (!authHeader) {
                    return res.status(401).json({ error: "Missing token" });
                }

                const idToken = authHeader.replace("Bearer ", "").trim();
                const decoded = await auth.verifyIdToken(idToken);

                const email = decoded.email;
                if (!email) {
                    return res.status(400).json({ error: "Email not found" });
                }

                if (!currentPassword) {
                    return res.status(400).json({ error: "Current password required" });
                }

                const API_KEY = process.env.API_KEY;

                // 🔥 Validate password by trying to sign in
                const response = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email,
                            password: currentPassword,
                            returnSecureToken: false
                        }),
                    }
                );

                const result = await response.json() as any;

                if (result.error) {
                    return res.status(400).json({ error: "Incorrect password" });
                }

                return res.status(200).json({ success: true });

            } catch (err: any) {
                console.error("reauthenticate error:", err);
                return res.status(500).json({ error: "Reauth failed" });
            }
        });
    }
);
