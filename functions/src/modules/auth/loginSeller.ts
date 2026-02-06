import { createCallableFunction, validators, validationErrors } from "../../utils/callable";
import { auth as firebaseAuth, db } from "../../config/firebase";

interface LoginSellerRequest {
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

export const loginSeller = createCallableFunction<LoginSellerRequest, any>(
  async (data, auth, context) => {
    const { email, password, role } = data;

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
      if (!FIREBASE_API_KEY) throw new Error("Missing Firebase API Key");

      // 1️⃣ Get user by email
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

      // 4️⃣ Verify approved/verified status
      if (!userData?.verified || userData?.verified === false) {
        throw new Error("Your account is pending verification. Please wait for approval.");
      }

      if (!userData?.email_verified || userData?.email_verified === false) {
        throw new Error("Please verify your email.");
      }

      // 5️⃣ Login via Firebase REST API (password check)
      const isEmulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
      const signInUrl = isEmulator
        ? `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`
        : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

      const response = await fetch(signInUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      });

      const authResponse = (await response.json()) as FirebaseAuthResponse;

      if (authResponse.error) {
        throw new Error("Invalid email or password");
      }

      // 6️⃣ Return final login response
      return {
        success: true,
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
      console.error("loginSeller error:", error);
      throw error;
    }
  },
  {
    region: "asia-south1",
    requireAuth: false
  }
);
