
interface LoginUserData {
    email: string;
    password: string;
}

interface FirebaseAuthResponse {
    localId?: string;
    idToken?: string;
    error?: {
        message: string;
    };
}

import * as functions from "firebase-functions";
import { auth } from "../../config/firebase";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const loginUser = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

        const { email, password } = req.body as LoginUserData;
        if (!email || !password) return res.status(400).json({ error: "Email and password required" });

        try {
            // Firebase Admin SDK cannot sign in with password
            // Use Firebase Auth REST API
            const FIREBASE_API_KEY = functions.config().app?.apikey;
            if (!FIREBASE_API_KEY) throw new Error("Missing Firebase API Key");

            const response = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password, returnSecureToken: true }),
                }
            );

            const data = await response.json() as FirebaseAuthResponse;
            if (data.error) return res.status(401).json({ error: data.error.message });

            return res.status(200).json({ success: true, uid: data.localId, idToken: data.idToken });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });
});

