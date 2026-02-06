import { createCallableFunction } from "../../utils/callable";
import { auth as firebaseAuth, db, adminRef } from "../../config/firebase";

interface PhoneLoginRequest {
  firebaseIdToken: string;
  latitude?: number;
  longitude?: number;
}

export const phoneLogin = createCallableFunction<
  PhoneLoginRequest,
  { success: boolean; message: string }
>(
  async (data) => {
    const { firebaseIdToken, latitude, longitude } = data;

    if (!firebaseIdToken) {
      throw new Error("Missing Firebase token");
    }

    // 1️⃣ VERIFY FIREBASE TOKEN
    const decoded = await firebaseAuth.verifyIdToken(firebaseIdToken);

    const uid = decoded.uid;
    const phone = decoded.phone_number;
    const email = decoded.email ?? null;
    const name = decoded.name ?? "";

    if (!phone) {
      throw new Error("Phone number missing");
    }

    const now = adminRef.firestore.FieldValue.serverTimestamp();

    // 2️⃣ CHECK EXISTING USER DOC + PROFILE
    const [userSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("customer_profiles").doc(uid).get(),
    ]);

    // 3️⃣ UPSERT BOTH USER DOC + PROFILE (PARALLEL)
    const updatePromises: Promise<any>[] = [];

    if (!userSnap.exists) {
      updatePromises.push(
        db.collection("users").doc(uid).set({
          uid,
          role: "user",
          name,
          email,
          phone,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        })
      );
    } else {
      updatePromises.push(
        db.collection("users").doc(uid).update({
          phone,
          ...(email && { email }),
          ...(name && { name }),
          updatedAt: now,
          lastLoginAt: now,
        })
      );
    }

    if (!profileSnap.exists) {
      updatePromises.push(
        db.collection("customer_profiles").doc(uid).set({
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
        })
      );
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

      updatePromises.push(
        db.collection("customer_profiles").doc(uid).update(updates)
      );
    }

    // Execute all updates in parallel
    await Promise.all(updatePromises);

    return {
      success: true,
      message: "Phone login successful",
    };
  },
  { region: "asia-south1", requireAuth: false }
);
