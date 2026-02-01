import * as functions from "firebase-functions";
import cors from "cors";
import { adminRef, db } from "../../config/firebase";

const corsHandler = cors({ origin: true });

export const validateCity = functions.https.onRequest(
    { region: 'asia-south1' }, async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                const { city } = req.body;

                if (!city) {
                    return res.status(400).json({ error: "City is required" });
                }

                const cityKey = city.toLowerCase().trim();

                const configSnap = await db
                    .collection("app_settings")
                    .doc("city_config")
                    .get();

                if (!configSnap.exists) {
                    return res.status(500).json({ error: "City config missing" });
                }

                const {
                    enabled_cities = [],
                    coming_soon_cities = [],
                    default_status = "coming_soon",
                } = configSnap.data()!;

                if (enabled_cities.includes(cityKey)) {
                    return res.status(200).json({
                        status: "ENABLED",
                        city: cityKey,
                    });
                }

                // 🔔 Save enquiry (fire & forget)
                const enquiryRef = db.collection("city_enquiries").doc(cityKey);
                await enquiryRef.set(
                    {
                        count: adminRef.firestore.FieldValue.increment(1),
                        last_enquired_at: adminRef.firestore.FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );

                return res.status(200).json({
                    status: "COMING_SOON",
                    city: cityKey,
                });
            } catch (err: any) {
                console.error("validateCity error:", err);
                return res.status(500).json({ error: "Failed to validate city" });
            }
        });
    }
);
