import { Request, Response } from "express";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";
import { createCache } from "../../utils/cache";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const corsHandler = cors({ origin: true });
const cache = createCache();

export const getUserDetailsHandler = (req: Request, res: Response): void => {
        corsHandler(req, res, async () => {

            if (req.method !== "GET") {
                return sendError(res, ErrorCodes.METHOD_NOT_ALLOWED, "GET method only", HttpStatus.METHOD_NOT_ALLOWED);
            }

            const uid = req.query.uid as string;
            if (!uid) return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "UID required", HttpStatus.BAD_REQUEST);

            try {
                // AUTHENTICATE REQUEST
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }

                // Check cache (90s TTL for user details)
                // const cacheKey = `user_details:${uid}`;
                // const cached = cache.get<any>(cacheKey);
                // if (cached) {
                //     return res.status(200).json(cached);
                // }

                // GET MAIN USER DOC
                const userDoc = await db.collection("users").doc(uid).get();
                if (!userDoc.exists) {
                    return sendError(res, ErrorCodes.NOT_FOUND, "User not found", HttpStatus.NOT_FOUND);
                }

                const userData = userDoc.data();

                // GET CUSTOMER PROFILE
                const customerSnap = await db
                    .collection("customer_profiles")
                    .where("user_id", "==", uid)
                    .limit(1)
                    .get();

                let customerProfile = null;
                if (!customerSnap.empty) {
                    customerProfile = customerSnap.docs[0].data();
                }

                const responseData = {
                    success: true,
                    user: {
                        ...userData,
                        ...(customerProfile ? { customer_profile: customerProfile } : {}),
                    },
                };

                // Cache result (90s TTL)
                //cache.set(cacheKey, responseData, 90000);

                return sendSuccess(res, {
                    user: {
                        ...userData,
                        ...(customerProfile ? { customer_profile: customerProfile } : {}),
                    }
                }, HttpStatus.OK);

            } catch (error: any) {
                console.error("getUserDetails error:", error);
                return sendError(res, ErrorCodes.INTERNAL_ERROR, error.message, error.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
};
