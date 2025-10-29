import * as functions from "firebase-functions";
import { auth, db, adminRef } from "../../config/firebase";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const registerUser = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "POST method required" });
        }

        const { email, password, name } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }

        try {
            const user = await auth.createUser({ email, password, displayName: name });

            await db.collection("users").doc(user.uid).set({
                uid: user.uid,
                email,
                name,
                createdAt: adminRef.firestore.FieldValue.serverTimestamp(),
            });

            return res.status(200).json({ success: true, uid: user.uid });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });
});
