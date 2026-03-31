import { Request, Response } from "express";
import cors from "cors";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const unregisterPushTokenHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {
            try {
                const user = await authenticateUser(req.headers.authorization);
                const { push_token } = req.body;

                if (!push_token) {
                    return res.status(400).json({ error: "Token required" });
                }

                const snapshot = await db
                    .collection("push_tokens")
                    .where("user_id", "==", user.uid)
                    .where("token", "==", push_token)
                    .get();

                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();

                res.json({ success: true });
            } catch (err) {
                res.status(401).json({ error: "Unauthorized" });
            }
        });
};
