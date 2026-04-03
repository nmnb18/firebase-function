import { Request, Response } from "express";
import { auth } from "../../config/firebase";
import { authenticateExpiredToken, AuthError } from "../../middleware/auth";
import cors from "cors";

interface LogoutUserData {
    uid: string;
}

const corsHandler = cors({ origin: true });

export const logoutHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") {
                    return res.status(405).json({ error: "Method not allowed" });
                }

                const { uid } = req.body as LogoutUserData;
                if (!uid) {
                    return res.status(400).json({ error: "UID is required" });
                }

                // Accept expired tokens — decode-only check that the token belongs to the claimed uid.
                authenticateExpiredToken(req.headers.authorization, uid);

                // Revoke user's refresh tokens
                await auth.revokeRefreshTokens(uid);

                return res.status(200).json({ success: true, message: "User logged out successfully" });
            } catch (error: any) {
                console.error("LogoutUser Error:", error);
                return res.status(error.statusCode ?? 500).json({ error: error.message || "Internal Server Error" });
            }
        });
};
