import * as functions from "firebase-functions";
import { db, auth } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { enforceSubscriptionStatus } from "../../utils/subscription";
import { createCache } from "../../utils/cache";

const corsHandler = cors({ origin: true });
const cache = createCache();
export const getSellerDetails = functions.https.onRequest(
    { region: 'asia-south1', minInstances: 1, timeoutSeconds: 30, memory: '256MiB' }, (req: any, res: any) => {
        corsHandler(req, res, async () => {
            if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

            const uid = req.query.uid as string;
            if (!uid) return res.status(400).json({ error: "UID required" });

            try {
                // Caching (60s)
                const cacheKey = `seller_details:${uid}`;
                const cached = cache.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json(cached);
                }
                // authenticate
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                // Parallel fetch user and seller profile
                const [userDoc, sellerSnap] = await Promise.all([
                    db.collection("users").doc(uid).get(),
                    db.collection("seller_profiles").where("user_id", "==", uid).limit(1).get()
                ]);
                if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
                const userData = userDoc.data();
                let sellerProfile = null;
                if (!sellerSnap.empty) {
                    const tempSellerProfile = sellerSnap.docs[0].data();
                    sellerProfile = await enforceSubscriptionStatus(tempSellerProfile, currentUser.uid);
                }
                const responseData = {
                    success: true,
                    user: {
                        ...userData,
                        ...(sellerProfile ? { seller_profile: sellerProfile } : {}),
                    },
                };
                cache.set(cacheKey, responseData, 60000);
                return res.status(200).json(responseData);
            } catch (err: any) {
                console.error("getSellerDetails error:", err);
                return res.status(err.statusCode ?? 500).json({ error: err.message });
            }
        });
    });
