import * as functions from "firebase-functions";
import cors from "cors";
import { auth, db, adminRef } from "../../config/firebase";

const corsHandler = cors({ origin: true });

export const phoneLogin = functions.https.onRequest(
    { region: 'asia-south1' },
    async (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            const { firebaseIdToken, latitude, longitude } = req.body;

            if (!firebaseIdToken) {
                return res.status(400).json({ error: "Missing Firebase token" });
            }

            try {
                // ---------------------------------------------
                // 1️⃣ VERIFY FIREBASE TOKEN
                // ---------------------------------------------
                const decoded = await auth.verifyIdToken(firebaseIdToken);

                const uid = decoded.uid;
                const phone = decoded.phone_number;
                const email = decoded.email ?? null;
                const name = decoded.name ?? "";

                if (!phone) {
                    return res.status(400).json({ error: "Phone number missing" });
                }

                const now = adminRef.firestore.FieldValue.serverTimestamp();

                // ---------------------------------------------
                // 2️⃣ UPSERT users/{uid}
                // ---------------------------------------------
                const userRef = db.collection("users").doc(uid);
                const userSnap = await userRef.get();

                if (!userSnap.exists) {
                    await userRef.set({
                        uid,
                        role: "user",
                        name,
                        email,
                        phone,
                        createdAt: now,
                        updatedAt: now,
                        lastLoginAt: now,
                    });
                } else {
                    await userRef.update({
                        phone,
                        ...(email && { email }),
                        ...(name && { name }),
                        updatedAt: now,
                        lastLoginAt: now,
                    });
                }

                // ---------------------------------------------
                // 3️⃣ UPSERT customer_profiles/{uid}
                // ---------------------------------------------
                const profileRef = db.collection("customer_profiles").doc(uid);
                const profileSnap = await profileRef.get();

                if (!profileSnap.exists) {
                    await profileRef.set({
                        user_id: uid,

                        account: {
                            name,
                            email,
                            phone,
                        },

                        location: latitude && longitude ? {
                            lat: latitude,
                            lng: longitude,
                        } : null,

                        preferences: {
                            notifications_enabled: true,
                            push_notifications: true,
                            email_notifications: true,
                        },

                        stats: {
                            loyalty_points: 0,
                            total_scans: 0,
                            total_rewards_claimed: 0,
                        },

                        created_at: now,
                        updated_at: now,
                        last_active: now,
                    });
                } else {
                    const updates: any = {
                        last_active: now,
                        updated_at: now,
                    };

                    if (latitude && longitude) {
                        updates.location = {
                            ...profileSnap.data()?.location,
                            lat: latitude,
                            lng: longitude,
                        };
                    }

                    await profileRef.update(updates);
                }

                // ---------------------------------------------
                // 4️⃣ DONE
                // ---------------------------------------------
                return res.status(200).json({
                    success: true,
                    message: "Phone login successful",
                });

            } catch (error) {
                console.error("phoneLogin error:", error);
                return res.status(401).json({ error: "Invalid Firebase token" });
            }
        });
    }
);
