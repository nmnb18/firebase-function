import * as functions from "firebase-functions";
import cors from "cors";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const registerPushToken = functions.https.onRequest(
    { region: 'asia-south1', timeoutSeconds: 10, memory: '128MiB' }, async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                const user = await authenticateUser(req.headers.authorization); // gives user.uid

                const {
                    push_token,
                    platform,
                    device_name,
                    device_model,
                } = req.body;

                if (!push_token) {
                    return res.status(400).json({ error: "Push token missing" });
                }

                // Avoid duplicates
                const existing = await db
                    .collection("push_tokens")
                    .where("user_id", "==", user.uid)
                    .where("token", "==", push_token)
                    .get();

                if (!existing.empty) {
                    return res.json({ success: true });
                }

                await db.collection("push_tokens").add({
                    user_id: user.uid,
                    token: push_token,
                    platform,
                    device_name,
                    device_model,
                    created_at: new Date(),
                    updated_at: new Date(),
                });

                res.json({ success: true });
            } catch (err) {
                console.error(err);
                res.status(401).json({ error: "Unauthorized" });
            }
        });
    });
