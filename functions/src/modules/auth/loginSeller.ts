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

export const loginSeller = functions.https.onRequest(
    { secrets: ["API_KEY"] },
    (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            const { email, password, role } = req.body as LoginUserData;
            if (!email || !password || !role) {
                return res
                    .status(400)
                    .json({ error: "Email, password, and role are required" });
            }

            try {
                const FIREBASE_API_KEY = process.env.API_KEY;
                if (!FIREBASE_API_KEY)
                    throw new Error("Missing Firebase API Key");

                // 1️⃣ Find user in Firebase Auth
                const userRecord = await auth.getUserByEmail(email);
                if (!userRecord) {
                    return res.status(404).json({ error: "User not found" });
                }

                // 2️⃣ Sign in via Firebase REST API
                const response = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password, returnSecureToken: true }),
                    }
                );
                const data = (await response.json()) as FirebaseAuthResponse;
                if (data.error)
                    return res.status(401).json({ error: data.error.message });

                // 3️⃣ Verify role match in users collection
                const userDoc = await db.collection("users").doc(userRecord.uid).get();
                if (!userDoc.exists) {
                    return res.status(404).json({ error: "User data missing" });
                }

                const userData = userDoc.data();
                if (userData?.role !== role) {
                    return res
                        .status(403)
                        .json({ error: `Role mismatch: expected ${role}` });
                }



                // 5️⃣ Merge and return all info together
                return res.status(200).json({
                    success: true,
                    uid: data.localId,
                    idToken: data.idToken,
                    refreshToken: data.refreshToken, // ✅ include this
                    expiresIn: data.expiresIn
                });
            } catch (err: any) {
                console.error("loginSeller error:", err);
                return res.status(500).json({ error: err.message });
            }
        });
    }
);
