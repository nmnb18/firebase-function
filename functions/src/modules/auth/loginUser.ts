import * as functions from "firebase-functions";
import { auth as firebaseAuth, db } from "../../config/firebase";
import { createCallableFunction, validators, validationErrors } from "../../utils/callable";

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

export const loginUser = createCallableFunction<LoginUserData, any>(
    async (data, auth, context) => {
        const { email, password, role } = data;

        // Validate inputs
        if (!email || !password || !role) {
            throw new Error("Email, password and role are required");
        }

        if (!validators.isEmail(email)) {
            throw new Error(validationErrors.invalidEmail);
        }

        if (!["seller", "user"].includes(role)) {
            throw new Error("Role must be 'seller' or 'user'");
        }

        try {
            const FIREBASE_API_KEY = process.env.API_KEY;
            if (!FIREBASE_API_KEY) {
                throw new Error("Missing Firebase API Key");
            }

            // 1️⃣ Get user by email & fetch user doc in parallel
            const userRecord = await firebaseAuth.getUserByEmail(email).catch(() => null);
            if (!userRecord) {
                throw new Error("Account not found");
            }

            // 2️⃣ Get Firestore user document
            const userDoc = await db.collection("users").doc(userRecord.uid).get();
            if (!userDoc.exists) {
                throw new Error("User data missing");
            }

            const userData = userDoc.data();

            // 3️⃣ Verify role
            if (userData?.role !== role) {
                throw new Error("Invalid account type for this login");
            }

            if (!userData?.email_verified) {
                throw new Error("Please verify your email");
            }

            // 4️⃣ Login via Firebase REST API (password check)
            const response = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password, returnSecureToken: true }),
                }
            );

            const authResponse = (await response.json()) as FirebaseAuthResponse;

            if (authResponse.error) {
                throw new Error("Invalid email or password");
            }

            // 5️⃣ Return final login response
            return {
                uid: authResponse.localId,
                idToken: authResponse.idToken,
                refreshToken: authResponse.refreshToken,
                expiresIn: authResponse.expiresIn,
                userData: {
                    email: userData?.email,
                    name: userData?.name,
                    role: userData?.role,
                }
            };
        } catch (error: any) {
            console.error("loginUser error:", error);
            throw error;
        }
    },
    {
        region: "asia-south1",
        requireAuth: false // Login doesn't require pre-auth
    }
);