import * as functions from "firebase-functions";
import { auth, db, adminRef } from "../../config/firebase";
import cors from "cors";
import crypto from "crypto";
import { resolveCityStatus, sendVerificationEmail } from "../../utils/helper";

const corsHandler = cors({ origin: true });

interface RegisterUserData {
    name: string;
    phone: string;
    email: string;
    password: string;

    street: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;

    lat: number;
    lng: number;
}

export const registerUser = functions.https.onRequest({ region: "asia-south1", minInstances: 1, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
    corsHandler(req, res, async () => {

        if (req.method !== "POST") {
            return res.status(405).json({ error: "POST method required" });
        }

        try {
            const data = req.body as RegisterUserData;

            const {
                name,
                phone,
                email,
                password,
                street,
                city,
                state,
                pincode,
                country = "India",
                lat,
                lng,
            } = data;

            // ---------------------------------------------
            // VALIDATION
            // ---------------------------------------------
            if (!name || !email || !phone || !password) {
                return res.status(400).json({
                    error: "Missing required fields: name, email, phone, password",
                });
            }

            if (!street || !city || !state || !pincode) {
                return res.status(400).json({
                    error: "Complete address is required",
                });
            }

            if (!lat || !lng) {
                return res.status(400).json({
                    error: "Location coordinates required",
                });
            }

            // ---------------------------------------------
            // CHECK EXISTING USER
            // ---------------------------------------------
            const emailExists = await auth.getUserByEmail(email).catch(() => null);
            if (emailExists) {
                return res.status(400).json({ error: "Email already exists" });
            }

            const phoneQuery = await db
                .collection("users")
                .where("phone", "==", phone)
                .limit(1)
                .get();

            if (!phoneQuery.empty) {
                return res.status(400).json({ error: "Phone already in use" });
            }

            // ---------------------------------------------
            // CREATE AUTH USER
            // ---------------------------------------------
            const user = await auth.createUser({
                email,
                password,
                displayName: name,
            });

            // ---------------------------------------------
            // CREATE MAIN USER DOC
            // ---------------------------------------------
            const verificationToken = crypto.randomBytes(32).toString("hex");
            const tokenExpiry = adminRef.firestore.Timestamp.fromDate(
                new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
            );
            await db.collection("users").doc(user.uid).set({
                uid: user.uid,
                role: "user",
                name,
                email,
                phone,
                email_verified: false,
                email_verification_token: verificationToken,
                email_verification_expires: tokenExpiry,
                createdAt: adminRef.firestore.FieldValue.serverTimestamp(),
                updatedAt: adminRef.firestore.FieldValue.serverTimestamp(),
            });

            // ---------------------------------------------
            // CUSTOMER PROFILE (STRUCTURED)
            // ---------------------------------------------
            const customerProfile = {
                user_id: user.uid,

                account: {
                    name,
                    email,
                    phone,
                },
                location: {
                    address: {
                        street,
                        city,
                        state,
                        pincode,
                        country,
                    },
                    lat,
                    lng,
                },

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
                activation: {
                    activated_by: '',
                    activated_at: ''
                },

                created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                last_active: adminRef.firestore.FieldValue.serverTimestamp(),
            };

            await db.collection("customer_profiles").doc(user.uid).set(customerProfile);
            const settingsSnap = await db
                .collection("app_settings")
                .doc("city_config")
                .get();

            const settings = settingsSnap.data();

            const cityStatus = resolveCityStatus(
                city,
                settings
            );
            // ---------------------------------------------
            // OPTIONAL: SEND WELCOME EMAIL
            // ---------------------------------------------
            try {
                await sendVerificationEmail(email, name, verificationToken);
            } catch { }

            return res.status(200).json({
                success: true,
                message: "User registered successfully",
                data: {
                    uid: user.uid,
                    email,
                    name,
                    phone,
                    role: "user",
                    city_status: cityStatus
                },
            });

        } catch (error: any) {
            console.error("Registration Error:", error);

            if (error.code === "auth/email-already-exists") {
                return res.status(400).json({ error: "Email already exists" });
            }

            return res.status(500).json({
                error: "Registration failed. Please try again later.",
            });
        }
    });
});
