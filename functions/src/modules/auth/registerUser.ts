import { createCallableFunction, validators, validationErrors } from "../../utils/callable";
import { auth as firebaseAuth, db, adminRef } from "../../config/firebase";
import crypto from "crypto";
import { resolveCityStatus, sendVerificationEmail } from "../../utils/helper";

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

export const registerUser = createCallableFunction<RegisterUserData, any>(
  async (data) => {
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

    // 1️⃣ VALIDATION
    if (!name || !email || !phone || !password) {
      throw new Error("Missing required fields: name, email, phone, password");
    }

    if (!street || !city || !state || !pincode) {
      throw new Error("Complete address is required");
    }

    if (!lat || !lng) {
      throw new Error("Location coordinates required");
    }

    if (!validators.isEmail(email)) {
      throw new Error(validationErrors.invalidEmail);
    }

    // 2️⃣ CHECK EXISTING USER (PARALLEL)
    const [emailExists, phoneExists] = await Promise.all([
      firebaseAuth.getUserByEmail(email).catch(() => null),
      db.collection("users").where("phone", "==", phone).limit(1).get()
    ]);

    if (emailExists) {
      throw new Error("Email already exists");
    }

    if (!phoneExists.empty) {
      throw new Error("Phone already in use");
    }

    // 3️⃣ CREATE AUTH USER
    const user = await firebaseAuth.createUser({
      email,
      password,
      displayName: name,
    });

    // 4️⃣ CREATE MAIN USER DOC + PROFILE + VERIFY CITY (PARALLEL)
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = adminRef.firestore.Timestamp.fromDate(
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

    const customerProfile = {
      user_id: user.uid,
      account: { name, email, phone },
      location: {
        address: { street, city, state, pincode, country },
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
      activation: { activated_by: "", activated_at: "" },
      created_at: adminRef.firestore.FieldValue.serverTimestamp(),
      updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
      last_active: adminRef.firestore.FieldValue.serverTimestamp(),
    };

    // Parallel operations
    await Promise.all([
      db.collection("users").doc(user.uid).set({
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
      }),
      db.collection("customer_profiles").doc(user.uid).set(customerProfile),
      sendVerificationEmail(email, name, verificationToken).catch((err) => {
        console.warn("Email send failed:", err);
      })
    ]);

    // 5️⃣ GET CITY STATUS
    const settingsSnap = await db.collection("app_settings").doc("city_config").get();
    const settings = settingsSnap.data();
    const cityStatus = resolveCityStatus(city, settings);

    return {
      success: true,
      data: {
        uid: user.uid,
        email,
        name,
        phone,
        role: "user",
        city_status: cityStatus,
      },
    };
  },
  { region: "asia-south1", requireAuth: false }
);
