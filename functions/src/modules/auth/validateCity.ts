import { createCallableFunction } from "../../utils/callable";
import { adminRef, db } from "../../config/firebase";

export const validateCity = createCallableFunction<
  { city: string },
  { status: "ENABLED" | "COMING_SOON"; city: string }
>(
  async (data) => {
    const { city } = data;

    if (!city) {
      throw new Error("City is required");
    }

    const cityKey = city.toLowerCase().trim();

    // Get city configuration
    const configSnap = await db
      .collection("app_settings")
      .doc("city_config")
      .get();

    if (!configSnap.exists) {
      throw new Error("City config missing");
    }

    const {
      enabled_cities = [],
      coming_soon_cities = [],
      default_status = "coming_soon",
    } = configSnap.data()!;

    // Check if city is enabled
    if (enabled_cities.includes(cityKey)) {
      return {
        status: "ENABLED",
        city: cityKey,
      };
    }

    // Save enquiry asynchronously (don't wait)
    db.collection("city_enquiries").doc(cityKey).set(
      {
        count: adminRef.firestore.FieldValue.increment(1),
        last_enquired_at: adminRef.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      console.warn("Failed to save city enquiry:", err);
    });

    return {
      status: "COMING_SOON",
      city: cityKey,
    };
  },
  { region: "asia-south1", requireAuth: false }
);
