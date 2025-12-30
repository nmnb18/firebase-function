import * as functions from "firebase-functions";
import { auth, db } from "../../config/firebase";
import cors from "cors";

const corsHandler = cors({ origin: true });

interface LoginUserData {
    email: string;
    password: string;
    role: "seller" | "user";
}

interface FirebaseAuthResponse {
    localId?: string;
    idToken?: string;
    error?: { message: string };
    refreshToken: string;
    expiresIn: string;
}

export const loginUser = functions.https.onRequest(
    { secrets: ["API_KEY"], region: "asia-south1", },
    (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            const { email, password, role } = req.body as LoginUserData;

            if (!email || !password || !role) {
                return res.status(400).json({ error: "Email, password and role are required" });
            }

            try {
                const FIREBASE_API_KEY = process.env.API_KEY;
                if (!FIREBASE_API_KEY) throw new Error("Missing Firebase API Key");

                // 1️⃣ Get user by email
                const userRecord = await auth.getUserByEmail(email).catch(() => null);
                if (!userRecord) {
                    return res.status(404).json({ error: "Account not found" });
                }

                // 2️⃣ Get Firestore user document
                const userDoc = await db.collection("users").doc(userRecord.uid).get();
                if (!userDoc.exists) {
                    return res.status(404).json({ error: "User data missing" });
                }

                const userData = userDoc.data();

                // 3️⃣ Verify role
                if (userData?.role !== role) {
                    return res.status(403).json({ error: "Invalid account type for this login" });
                }

                // 5️⃣ Login via Firebase REST API (password check)
                const response = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password, returnSecureToken: true }),
                    }
                );

                const data = (await response.json()) as FirebaseAuthResponse;

                if (data.error) {
                    return res.status(401).json({ error: "Invalid email or password" });
                }

                // 6️⃣ Return final login response
                return res.status(200).json({
                    success: true,
                    uid: data.localId,
                    idToken: data.idToken,
                    refreshToken: data.refreshToken,
                    expiresIn: data.expiresIn
                });

            } catch (err: any) {
                console.error("loginSeller error:", err);
                return res.status(500).json({ error: "Login failed. Try again later." });
            }
        });
    }
);

