import * as functions from "firebase-functions";
import { auth, db, adminRef } from "../../config/firebase";
import cors from "cors";
import {
    getMonthlyQRLimit,
    getSubscriptionEndDate,
    getSubscriptionPrice,
    sendWelcomeEmail
} from "../../utils/helper";

const corsHandler = cors({ origin: true });

interface RegisterSellerData {
    email: string;
    password: string;
    name: string;
    shopName: string;
    phone: string;
    businessType: string;
    category: string;
    description: string;

    street: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;

    enableLocation?: boolean;
    locationRadius?: number;
    latitude?: number | null;
    longitude?: number | null;

    gstNumber?: string;
    panNumber?: string;
    businessRegistrationNumber?: string;

    /** Rewards */
    rewardType?: "default" | "flat" | "percentage" | "slab";
    defaultPoints?: number;
    flatPoints?: number;
    percentageValue?: number;
    slabRules?: Array<{ min: number; max: number; points: number }>;
    rewardName?: string;
    rewardDescription?: string;
    paymentRewardEnabled?: boolean;
    dailyMaxPoints?: number;
    upiIds: string[];
    qrCodeType: "dynamic" | "static" | "static_hidden";
    subscriptionTier: "free" | "pro" | "enterprise";

    establishedYear?: string | null;
    acceptTerms: boolean;
}

export const registerSeller = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "POST method required" });
        }

        try {
            const data = req.body as RegisterSellerData;

            // ------------------------------
            // 🔍 Validate Required Fields
            // ------------------------------
            const {
                email,
                password,
                name,
                shopName,
                phone,
                businessType,
                category,
                description,
                street,
                city,
                state,
                pincode,
                country = "India",
                enableLocation = false,
                locationRadius = 100,
                latitude,
                longitude,
                gstNumber,
                panNumber,
                businessRegistrationNumber,
                qrCodeType = "dynamic",
                subscriptionTier = "free",
                establishedYear,
                acceptTerms,
            } = data;
            console.error(data);
            if (!email || !password || !name || !shopName || !phone) {
                return res.status(400).json({
                    error: "Missing required fields: email, password, name, shopName, phone",
                });
            }

            if (!acceptTerms) {
                return res.status(400).json({
                    error: "You must accept the terms and conditions",
                });
            }

            // ------------------------------
            // 🔐 Create Firebase Auth User
            // ------------------------------
            const user = await auth.createUser({
                email,
                password,
                displayName: name,
            });

            // ------------------------------
            // 👤 Create base user record
            // ------------------------------
            await db.collection("users").doc(user.uid).set({
                uid: user.uid,
                email,
                name,
                phone,
                role: "seller",
                verified: false,
                createdAt: adminRef.firestore.FieldValue.serverTimestamp(),
                updatedAt: adminRef.firestore.FieldValue.serverTimestamp(),
            });

            // ------------------------------
            // 🏪 Build Seller Profile Object
            // ------------------------------
            console.log(data);
            const sellerProfile = {
                user_id: user.uid,

                account: {
                    name,
                    email,
                    phone,
                    established_year: establishedYear || null,
                },

                business: {
                    shop_name: shopName,
                    business_type: businessType,
                    category,
                    description,
                },

                location: {
                    address: {
                        street,
                        city,
                        state,
                        pincode,
                        country,
                    },
                    lat: latitude || null,
                    lng: longitude || null,
                    radius_meters: enableLocation ? locationRadius : null,
                },

                verification: {
                    gst_number: gstNumber || null,
                    pan_number: panNumber || null,
                    business_registration_number: businessRegistrationNumber || null,
                    status: "pending",
                    is_verified: false,
                },

                // ---------------------------------------------------
                // ⭐ REWARD SETTINGS (All 4 Types Supported)
                // ---------------------------------------------------
                rewards: {
                    enabled: true,

                    reward_type: data.rewardType ?? "default",

                    default_points_value: data.defaultPoints ?? 1,

                    flat_points: data.flatPoints ?? 0,

                    percentage_value: data.percentageValue ?? 0,

                    slab_rules: data.slabRules ?? [],

                    payment_reward_enabled: data.upiIds?.length > 0,

                    daily_max_points: data.dailyMaxPoints ?? 100,

                    reward_name: data.rewardName ?? "",
                    reward_description: data.rewardDescription ?? "",
                },

                upiIds: data.upiIds,

                qr_settings: {
                    qr_code_type: qrCodeType,
                },

                subscription: {
                    tier: subscriptionTier,
                    monthly_limit: getMonthlyQRLimit(subscriptionTier),
                    price: getSubscriptionPrice(subscriptionTier),
                    status: "active",
                    period_start: adminRef.firestore.FieldValue.serverTimestamp(),
                    expires_at: getSubscriptionEndDate(),
                },

                media: {
                    logo_url: null,
                    banner_url: null,
                    gallery_urls: [],
                },

                stats: {
                    total_scans: 0,
                    total_points_distributed: 0,
                    active_customers: 0,
                    monthly_scans: 0,
                },

                settings: {
                    notifications_enabled: true,
                    email_notifications: true,
                    push_notifications: true,
                },

                created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                last_active: adminRef.firestore.FieldValue.serverTimestamp(),
            };

            // ------------------------------
            // 📝 Save Seller Profile
            // ------------------------------
            await db.collection("seller_profiles").doc(user.uid).set(sellerProfile);

            // ------------------------------
            // ✉ Optional Welcome Email
            // ------------------------------
            try {
                await sendWelcomeEmail(email, name, shopName);
            } catch { }

            // ------------------------------
            // 🎉 Success Response
            // ------------------------------
            return res.status(200).json({
                success: true,
                message: "Seller registered successfully",
                data: {
                    uid: user.uid,
                    email,
                    name,
                    shopName,
                    role: "seller",
                },
            });

        } catch (error: any) {
            console.error("Registration Error:", error);

            if (error.code === "auth/email-already-exists") {
                return res.status(400).json({ error: "Email already exists" });
            }

            return res.status(500).json({
                error: "Registration failed. Please try again.",
                details: error.message,
            });
        }
    });
});
