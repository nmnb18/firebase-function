import { Request, Response, NextFunction } from "express";
import { auth, db, adminRef } from "../../config/firebase";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const phoneLoginHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { firebaseIdToken, latitude, longitude } = req.body;

            if (!firebaseIdToken) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Missing Firebase token", HttpStatus.BAD_REQUEST);
            }

    try {
                // ---------------------------------------------
                // 1️⃣ VERIFY FIREBASE TOKEN
                // ---------------------------------------------
                const decoded = await auth.verifyIdToken(firebaseIdToken);

                const uid = decoded.uid;
                const phone = decoded.phone_number;
                const email = decoded.email ?? null;
                const name = decoded.name ?? "";

                if (!phone) {
                    return sendError(res, ErrorCodes.INVALID_INPUT, "Phone number missing", HttpStatus.BAD_REQUEST);
                }

                const now = adminRef.firestore.FieldValue.serverTimestamp();

                // ---------------------------------------------
                // 2️⃣ UPSERT users/{uid}
                // ---------------------------------------------
                const userRef = db.collection("users").doc(uid);
                const userSnap = await userRef.get();

                if (!userSnap.exists) {
                    await userRef.set({
                        uid,
                        role: "user",
                        name,
                        email,
                        phone,
                        createdAt: now,
                        updatedAt: now,
                        lastLoginAt: now,
                    });
                } else {
                    await userRef.update({
                        phone,
                        ...(email && { email }),
                        ...(name && { name }),
                        updatedAt: now,
                        lastLoginAt: now,
                    });
                }

                // ---------------------------------------------
                // 3️⃣ UPSERT customer_profiles/{uid}
                // ---------------------------------------------
                const profileRef = db.collection("customer_profiles").doc(uid);
                const profileSnap = await profileRef.get();

                if (!profileSnap.exists) {
                    await profileRef.set({
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
                    });
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

                    await profileRef.update(updates);
                }

                // ---------------------------------------------
                // 4️⃣ DONE
                // ---------------------------------------------
                return sendSuccess(res, { message: "Phone login successful" }, HttpStatus.OK);

    } catch (err) {
        next(err);
    }
};