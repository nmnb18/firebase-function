import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { createCache } from "../../utils/cache";

const corsHandler = cors({ origin: true });
const cache = createCache();

export const getUserDetails = functions.https.onRequest(
    { region: 'asia-south1', minInstances: 1, timeoutSeconds: 30, memory: '256MiB' }, (req, res) => {
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

                // Check cache (90s TTL for user details)
                const cacheKey = `user_details:${uid}`;
                const cached = cache.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json(cached);
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

                const responseData = {
                    success: true,
                    user: {
                        ...userData,
                        ...(customerProfile ? { customer_profile: customerProfile } : {}),
                    },
                };

                // Cache result (90s TTL)
                cache.set(cacheKey, responseData, 90000);

                return res.status(200).json(responseData);

            } catch (error: any) {
                console.error("getUserDetails error:", error);
                return res.status(error.statusCode ?? 500).json({ error: error.message });
            }
        });
    });
