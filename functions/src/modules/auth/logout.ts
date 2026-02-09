import * as functions from "firebase-functions";
import { auth, db } from "../../config/firebase";

import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

interface LogoutUserData {
    uid: string;
}
const corsHandler = cors({ origin: true });

export const logout = functions.https.onRequest(
    { region: 'asia-south1', timeoutSeconds: 10, memory: '128MiB' }, async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") {
                    return res.status(405).json({ error: "Method not allowed" });
                }

                // authenticate
                const currentUser = await authenticateUser(req.headers.authorization);
                // authenticateUser in your middleware likely ends response on failure; 
                // assume it sets req.currentUser (adjust if your function works differently)
                //const currentUser = (req as any).currentUser;
                if (!currentUser || !currentUser.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
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
                return res.status(err.statusCode ?? 500).json({ error: error.message || "Internal Server Error" });
            }
        });
    });
