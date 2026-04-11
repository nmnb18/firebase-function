import { Request, Response, NextFunction } from "express";
import { adminRef, db } from "../../config/firebase";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const validateCityHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
                const { city } = req.body;

                if (!city) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "City is required", HttpStatus.BAD_REQUEST);
                }

                const cityKey = city.toLowerCase().trim();

                const configSnap = await db
                    .collection("app_settings")
                    .doc("city_config")
                    .get();

                if (!configSnap.exists) {
                    return sendError(res, ErrorCodes.INTERNAL_ERROR, "City config missing", HttpStatus.INTERNAL_SERVER_ERROR);
                }

                const {
                    enabled_cities = [],
                    coming_soon_cities = [],
                    default_status = "coming_soon",
                } = configSnap.data()!;

                if (enabled_cities.includes(cityKey)) {
                    return sendSuccess(res, { status: "ENABLED", city: cityKey }, HttpStatus.OK);
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

                return sendSuccess(res, { status: "COMING_SOON", city: cityKey }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};