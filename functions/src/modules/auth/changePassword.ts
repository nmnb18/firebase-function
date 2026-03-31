import { Request, Response } from "express";
import { auth } from "../../config/firebase";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const changePasswordHandler = (req: Request, res: Response): void => {
    corsHandler(req, res, async () => {
            try {
                if (req.method !== "POST") {
                    return res.status(405).json({ error: "POST only" });
                }

                const { newPassword } = req.body;
                const authHeader = req.headers.authorization;

                if (!authHeader) {
                    return res.status(401).json({ error: "Missing token" });
                }

                if (!newPassword) {
                    return res.status(400).json({ error: "New password required" });
                }

                const idToken = authHeader.replace("Bearer ", "").trim();
                const decoded = await auth.verifyIdToken(idToken);
                const uid = decoded.uid;

                // 🔥 Update password in Firebase Auth
                await auth.updateUser(uid, { password: newPassword });

                return res.status(200).json({
                    success: true,
                    message: "Password updated successfully"
                });

            } catch (err: any) {
                console.error("changePassword error:", err);
                return res.status(err.statusCode ?? 500).json({
                    success: false,
                    error: "Failed to update password"
                });
            }
        });
};
