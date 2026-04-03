import { Request, Response } from "express";
import { auth, db } from "../../config/firebase";
import cors from "cors";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

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

export const loginUserHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
            }

            const { email, password, role } = req.body as LoginUserData;

            if (!email || !password || !role) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Email, password and role are required", HttpStatus.BAD_REQUEST);
            }

            try {
                const FIREBASE_API_KEY = process.env.API_KEY;
                if (!FIREBASE_API_KEY) throw new Error("Missing Firebase API Key");

                // 1️⃣ Get user by email
                const userRecord = await auth.getUserByEmail(email).catch(() => null);
                if (!userRecord) {
                    return sendError(res, ErrorCodes.NOT_FOUND, "Account not found", HttpStatus.NOT_FOUND);
                }

                // 2️⃣ Get Firestore user document
                const userDoc = await db.collection("users").doc(userRecord.uid).get();
                if (!userDoc.exists) {
                    return sendError(res, ErrorCodes.NOT_FOUND, "User data missing", HttpStatus.NOT_FOUND);
                }

                const userData = userDoc.data();

                // 3️⃣ Verify role
                if (userData?.role !== role) {
                    return sendError(res, ErrorCodes.FORBIDDEN, "Invalid account type for this login", HttpStatus.FORBIDDEN);
                }

                if (!userData?.email_verified || userData?.email_verified === false) {
                    return sendError(res, ErrorCodes.FORBIDDEN, "Please verify your email.", HttpStatus.FORBIDDEN);
                }

                // 5️⃣ Login via Firebase REST API (password check)
                const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
                const identityToolkitBase = authEmulatorHost
                    ? `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1`
                    : `https://identitytoolkit.googleapis.com/v1`;
                const response = await fetch(
                    `${identityToolkitBase}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password, returnSecureToken: true }),
                    }
                );

                const data = (await response.json()) as FirebaseAuthResponse;

                if (data.error) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Invalid email or password", HttpStatus.UNAUTHORIZED);
                }

                // 6️⃣ Return final login response
                return sendSuccess(res, {
                    uid: data.localId,
                    idToken: data.idToken,
                    refreshToken: data.refreshToken,
                    expiresIn: data.expiresIn
                }, HttpStatus.OK);

            } catch (err: any) {
                console.error("loginSeller error:", err);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, "Login failed. Try again later.", err.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};

