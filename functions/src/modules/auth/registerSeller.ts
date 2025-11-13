import * as functions from "firebase-functions";
import { auth, db, adminRef } from "../../config/firebase";
import cors from "cors";
import { getMonthlyQRLimit, getSubscriptionEndDate, getSubscriptionPrice, sendWelcomeEmail } from "../../utils/helper";

const corsHandler = cors({ origin: true });



interface RegisterSellerData {
    email: string;
    password: string;
    name: string;
    shopName: string;
    phone: string;
    businessType: "retail" | "restaurant" | "service" | "fmcg" | "other";
    category: string;
    description: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
    enableLocation?: boolean;
    locationRadius?: number;
    gstNumber?: string;
    panNumber?: string;
    businessRegistrationNumber?: string;
    qrCodeType: "dynamic" | "static" | "static_hidden";
    defaultPoints: number;
    subscriptionTier: "free" | "pro" | "enterprise";
    acceptTerms: boolean;
    latitude?: number | null;
    longitude?: number | null;
    establishedYear?: string | null;
}

export const registerSeller = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "POST method required" });
        }

        try {
            const data = req.body as RegisterSellerData;

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
                gstNumber,
                panNumber,
                businessRegistrationNumber,
                qrCodeType = "dynamic",
                defaultPoints = 1,
                subscriptionTier = "free",
                acceptTerms,
                latitude,
                longitude,
                establishedYear
            } = data;

            // Validation
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

            // 1. Create Firebase Auth User
            const user = await auth.createUser({
                email,
                password,
                displayName: name,
            });

            // 2. Create main user doc
            await db.collection("users").doc(user.uid).set({
                uid: user.uid,
                email,
                name,
                phone,
                role: "seller",
                createdAt: adminRef.firestore.FieldValue.serverTimestamp(),
                updatedAt: adminRef.firestore.FieldValue.serverTimestamp(),
            });

            // 3. Build structured seller profile
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

                rewards: {
                    default_points_value: defaultPoints,
                    reward_points: 50,
                    reward_description: "",
                    reward_name: "",
                },

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

            await db.collection("seller_profiles").doc(user.uid).set(sellerProfile);

            // 4. Welcome Email (optional)
            try {
                await sendWelcomeEmail(email, name, shopName);
            } catch { }

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

            return res
                .status(500)
                .json({ error: "Registration failed. Please try again." });
        }
    });
});

