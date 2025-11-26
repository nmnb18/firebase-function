import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const getUserDetails = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {

        if (req.method !== "GET") {
            return res.status(405).json({ error: "GET method only" });
        }

        const uid = req.query.uid as string;
        if (!uid) return res.status(400).json({ error: "UID required" });

        try {
            // AUTHENTICATE REQUEST
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser || !currentUser.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            // GET MAIN USER DOC
            const userDoc = await db.collection("users").doc(uid).get();
            if (!userDoc.exists) {
                return res.status(404).json({ error: "User not found" });
            }

            const userData = userDoc.data();

            // GET CUSTOMER PROFILE
            const customerSnap = await db
                .collection("customer_profiles")
                .where("user_id", "==", uid)
                .limit(1)
                .get();

            let customerProfile = null;
            if (!customerSnap.empty) {
                customerProfile = customerSnap.docs[0].data();
            }

            return res.status(200).json({
                success: true,
                user: {
                    ...userData,
                    ...(customerProfile ? { customer_profile: customerProfile } : {}),
                },
            });

        } catch (error: any) {
            console.error("getUserDetails error:", error);
            return res.status(500).json({ error: error.message });
        }
    });
});
