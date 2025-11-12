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
}

export const registerSeller = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "POST method required" });
        }

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
            longitude
        } = req.body as RegisterSellerData;

        // Validation
        if (!email || !password || !name || !shopName || !phone) {
            return res.status(400).json({
                error: "Missing required fields: email, password, name, shopName, phone"
            });
        }

        if (!acceptTerms) {
            return res.status(400).json({
                error: "You must accept the terms and conditions"
            });
        }

        try {
            // 1. Create Firebase Auth user
            const user = await auth.createUser({
                email,
                password,
                displayName: name,
                emailVerified: false
            });

            // 2. Create user document in 'users' collection
            const userDoc = {
                uid: user.uid,
                email,
                name,
                phone,
                role: "seller",
                createdAt: adminRef.firestore.FieldValue.serverTimestamp(),
                updatedAt: adminRef.firestore.FieldValue.serverTimestamp(),
            };

            await db.collection("users").doc(user.uid).set(userDoc);

            // 3. Create seller profile in 'seller_profiles' collection
            const sellerProfile = {
                // Basic Information
                user_id: user.uid,
                email,
                phone,

                // Business Information
                shop_name: shopName,
                business_type: businessType,
                category,
                description,

                // Location Information
                address: {
                    street,
                    city,
                    state,
                    pincode,
                    country,
                },
                location_lat: latitude, // Can be set later
                location_lng: longitude, // Can be set later
                location_radius_meters: enableLocation ? locationRadius : null,

                // Business Verification
                gst_number: gstNumber || null,
                pan_number: panNumber || null,
                business_registration_number: businessRegistrationNumber || null,
                is_verified: false,
                verification_status: 'pending',

                // QR Code Settings
                qr_code_type: qrCodeType,
                default_points_value: defaultPoints,
                subscription_tier: subscriptionTier,

                // Media
                logo_url: null,
                banner_url: null,
                gallery_urls: [],

                // Statistics
                total_scans: 0,
                total_points_distributed: 0,
                active_customers: 0,
                monthly_scans: 0,

                // Settings
                notifications_enabled: true,
                email_notifications: true,
                push_notifications: true,

                // Timestamps
                created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                last_active: adminRef.firestore.FieldValue.serverTimestamp(),
            };

            await db.collection("seller_profiles").doc(user.uid).set(sellerProfile);

            // 4. Create subscription record
            const subscriptionData = {
                seller_id: user.uid,
                tier: subscriptionTier,
                monthly_qr_limit: getMonthlyQRLimit(subscriptionTier),
                price: getSubscriptionPrice(subscriptionTier),
                status: 'active',
                current_period_start: adminRef.firestore.FieldValue.serverTimestamp(),
                current_period_end: getSubscriptionEndDate(),
                created_at: adminRef.firestore.FieldValue.serverTimestamp(),
            };

            await db.collection("seller_subscriptions").doc(user.uid).set(subscriptionData);

            // 5. Send welcome email (optional)
            try {
                await sendWelcomeEmail(email, name, shopName);
            } catch (emailError) {
                console.error("Failed to send welcome email:", emailError);
                // Don't fail registration if email fails
            }

            return res.status(200).json({
                success: true,
                message: "Seller registered successfully",
                data: {
                    uid: user.uid,
                    email,
                    name,
                    shopName,
                    role: "seller"
                }
            });

        } catch (error: any) {
            console.error("Seller registration error:", error);

            // Handle specific Firebase auth errors
            if (error.code === 'auth/email-already-exists') {
                return res.status(400).json({
                    error: "Email already exists. Please use a different email."
                });
            } else if (error.code === 'auth/invalid-email') {
                return res.status(400).json({
                    error: "Invalid email address."
                });
            } else if (error.code === 'auth/weak-password') {
                return res.status(400).json({
                    error: "Password is too weak. Please use a stronger password."
                });
            }

            return res.status(500).json({
                error: "Registration failed. Please try again."
            });
        }
    });
});
