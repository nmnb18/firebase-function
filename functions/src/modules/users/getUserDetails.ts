

import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const getUserDetails = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

        const uid = req.query.uid as string;
        if (!uid) return res.status(400).json({ error: "UID required" });

        try {
            const doc = await db.collection("users").doc(uid).get();
            if (!doc.exists) return res.status(404).json({ error: "User not found" });

            return res.status(200).json({ success: true, user: doc.data() });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });
});


