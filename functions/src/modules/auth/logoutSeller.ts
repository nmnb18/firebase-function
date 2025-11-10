import * as functions from "firebase-functions";
import { auth, db } from "../../config/firebase";

import cors from "cors";

interface LogoutUserData {
    uid: string;
}
const corsHandler = cors({ origin: true });

export const logoutSeller = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            const { uid } = req.body as LogoutUserData;

            if (!uid) {
                return res.status(400).json({ error: "UID is required" });
            }

            // Revoke user's refresh tokens
            await auth.revokeRefreshTokens(uid);

            return res.status(200).json({ success: true, message: "User logged out successfully" });
        } catch (error: any) {
            console.error("LogoutUser Error:", error);
            return res.status(500).json({ error: error.message || "Internal Server Error" });
        }
    });
});
