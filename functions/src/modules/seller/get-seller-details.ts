import * as functions from "firebase-functions";
import { db, auth } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { enforceSubscriptionStatus } from "../../utils/subscription";

const corsHandler = cors({ origin: true });

export const getSellerDetails = functions.https.onRequest(
    { region: 'asia-south1' }, (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

            const uid = req.query.uid as string;
            if (!uid) return res.status(400).json({ error: "UID required" });

            try {
                // authenticate
                const currentUser = await authenticateUser(req.headers.authorization);
                // authenticateUser in your middleware likely ends response on failure; 
                // assume it sets req.currentUser (adjust if your function works differently)
                //const currentUser = (req as any).currentUser;
                if (!currentUser || !currentUser.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                const userDoc = await db.collection("users").doc(uid).get();
                if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

                const userData = userDoc.data();

                // Include seller profile if exists
                const sellerSnap = await db.collection("seller_profiles")
                    .where("user_id", "==", uid)
                    .limit(1)
                    .get();

                let sellerProfile = null;
                if (!sellerSnap.empty) {
                    const tempSellerProfile = sellerSnap.docs[0].data();
                    sellerProfile = await enforceSubscriptionStatus(tempSellerProfile, currentUser.uid);
                }

                return res.status(200).json({
                    success: true,
                    user: {
                        ...userData,
                        ...(sellerProfile ? { seller_profile: sellerProfile } : {}),
                    },
                });
            } catch (err: any) {
                console.error("getUserDetails error:", err);
                return res.status(500).json({ error: err.message });
            }
        });
    });
