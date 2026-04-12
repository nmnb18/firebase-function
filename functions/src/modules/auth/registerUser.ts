import { Request, Response, NextFunction } from "express";
import { auth, db, adminRef } from "../../config/firebase";
import crypto from "crypto";
import { resolveCityStatus, sendVerificationEmail } from "../../utils/helper";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

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

export const registerUserHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
            const data = req.body as RegisterUserData;

            const {
                name,
                phone: rawPhone,
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

            // Normalize phone to E.164 format (+91XXXXXXXXXX)
            const digits = rawPhone.replace(/\D/g, "");
            const phone = digits.length === 10
                ? `+91${digits}`
                : digits.length === 12 && digits.startsWith("91")
                    ? `+${digits}`
                    : rawPhone;

            // ---------------------------------------------
            // VALIDATION
            // ---------------------------------------------
            if (!name || !email || !phone || !password) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Missing required fields: name, email, phone, password", HttpStatus.BAD_REQUEST);
            }

            if (!street || !city || !state || !pincode) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Complete address is required", HttpStatus.BAD_REQUEST);
            }

            if (!lat || !lng) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Location coordinates required", HttpStatus.BAD_REQUEST);
            }

            // ---------------------------------------------
            // CHECK EXISTING USER
            // ---------------------------------------------
            const emailExists = await auth.getUserByEmail(email).catch(() => null);
            if (emailExists) {
                return sendError(res, ErrorCodes.ALREADY_EXISTS, "Email already exists", HttpStatus.BAD_REQUEST);
            }

            const phoneQuery = await db
                .collection("users")
                .where("phone", "==", phone)
                .limit(1)
                .get();

            if (!phoneQuery.empty) {
                return sendError(res, ErrorCodes.ALREADY_EXISTS, "Phone already in use", HttpStatus.BAD_REQUEST);
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
                auth_method: "email",
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
                auth_method: "email",

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

            // Parallelize: Save customer profile + fetch settings
            const [, settingsSnap] = await Promise.all([
                db.collection("customer_profiles").doc(user.uid).set(customerProfile),
                db.collection("app_settings").doc("city_config").get()
            ]);

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

            return sendSuccess(res, {
                message: "User registered successfully",
                uid: user.uid,
                email,
                name,
                phone,
                role: "user",
                city_status: cityStatus
            }, HttpStatus.OK);

    } catch (error: any) {
        if (error.code === "auth/email-already-exists") {
            return sendError(res, ErrorCodes.ALREADY_EXISTS, "Email already exists", HttpStatus.BAD_REQUEST);
        }
        next(error);
    }
};
