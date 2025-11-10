
interface LoginUserData {
    email: string;
    password: string;
    role: "seller" | "user";
}

interface FirebaseAuthResponse {
    localId?: string;
    idToken?: string;
    error?: {
        message: string;
    };
}

import * as functions from "firebase-functions";
import { auth, db } from "../../config/firebase";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const loginSeller = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

        const { email, password, role } = req.body as LoginUserData;
        if (!email || !password || !role) {
            return res.status(400).json({ error: "Email, password, and role are required" });
        }

        try {
            // Firebase Admin SDK cannot sign in with password
            // Use Firebase Auth REST API
            const FIREBASE_API_KEY = functions.config().app?.apikey;
            if (!FIREBASE_API_KEY) throw new Error("Missing Firebase API Key");

            const userRecord = await auth.getUserByEmail(email);
            if (!userRecord) {
                return res.status(404).json({ error: "User not found" });
            }

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

            // Verify role match in Firestore
            const userDoc = await db.collection("users").doc(userRecord.uid).get();
            if (!userDoc.exists) {
                return res.status(404).json({ error: "User data missing" });
            }

            const userData = userDoc.data();
            if (userData?.role !== role) {
                return res.status(403).json({ error: `Role mismatch: expected ${role}` });
            }

            return res.status(200).json({ success: true, uid: data.localId, idToken: data.idToken, ...userData });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });
});

