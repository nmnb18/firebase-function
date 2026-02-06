import { createCallableFunction, validators, validationErrors } from "../../utils/callable";
import { auth as firebaseAuth, db, adminRef } from "../../config/firebase";
import crypto from "crypto";
import {
    getMonthlyScanLimit,
    getSubscriptionEndDate,
    getSubscriptionPrice,
    sendVerificationEmail
} from "../../utils/helper";

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
    subscriptionTier: "free" | "pro" | "premium";
    establishedYear?: string | null;
    acceptTerms: boolean;
}

export const registerSeller = createCallableFunction<RegisterSellerData, any>(
  async (data) => {
    // 1️⃣ EXTRACT & VALIDATE REQUIRED FIELDS
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
      subscriptionTier = "pro",
      establishedYear,
      acceptTerms,
    } = data;

    if (!email || !password || !name || !shopName) {
      throw new Error("Missing required fields: email, password, name, shopName");
    }

    if (!acceptTerms) {
      throw new Error("You must accept the terms and conditions");
    }

    if (!validators.isEmail(email)) {
      throw new Error(validationErrors.invalidEmail);
    }

    // 2️⃣ CREATE FIREBASE AUTH USER
    const user = await firebaseAuth.createUser({
      email,
      password,
      displayName: name,
    });

    // 3️⃣ BUILD SELLER PROFILE OBJECT
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = adminRef.firestore.Timestamp.fromDate(
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

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
        upi_ids: data.upiIds,
        first_scan_bonus: { enabled: false, points: 0 }
      },
      qr_settings: {
        qr_code_type: qrCodeType,
      },
      subscription: {
        tier: "pro",
        monthly_limit: getMonthlyScanLimit("pro"),
        price: getSubscriptionPrice("pro"),
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
        monthly_scans: {},
        users_activated: 0,
        first_scan_bonus_given: 0
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

    // 4️⃣ CREATE USER DOC + SELLER PROFILE + SEND EMAIL (PARALLEL)
    await Promise.all([
      db.collection("users").doc(user.uid).set({
        uid: user.uid,
        email,
        name,
        phone,
        role: "seller",
        email_verified: false,
        email_verification_token: verificationToken,
        email_verification_expires: tokenExpiry,
        verified: false,
        createdAt: adminRef.firestore.FieldValue.serverTimestamp(),
        updatedAt: adminRef.firestore.FieldValue.serverTimestamp(),
      }),
      db.collection("seller_profiles").doc(user.uid).set(sellerProfile),
      sendVerificationEmail(email, name, verificationToken).catch((err) => {
        console.warn("Email send failed:", err);
      })
    ]);

    return {
      success: true,
      data: {
        uid: user.uid,
        email,
        name,
        shopName,
        role: "seller",
      },
    };
  },
  { region: "asia-south1", requireAuth: false }
);
