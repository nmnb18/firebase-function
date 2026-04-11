import { Request, Response, NextFunction } from "express";
import { db, auth } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { enforceSubscriptionStatus } from "../../utils/subscription";
import { createCache } from "../../utils/cache";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const cache = createCache();

export const getSellerDetailsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const uid = req.query.uid as string;
            if (!uid) return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "UID required", HttpStatus.BAD_REQUEST);

    try {
                // Caching (60s)
                // const cacheKey = `seller_details:${uid}`;
                // const cached = cache.get<any>(cacheKey);
                // if (cached) {
                //     return res.status(200).json(cached);
                // }
                // authenticate
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }
                // Parallel fetch user and seller profile
                const [userDoc, sellerSnap] = await Promise.all([
                    db.collection("users").doc(uid).get(),
                    db.collection("seller_profiles").where("user_id", "==", uid).limit(1).get()
                ]);
                if (!userDoc.exists) return sendError(res, ErrorCodes.NOT_FOUND, "User not found", HttpStatus.NOT_FOUND);
                const userData = userDoc.data();
                let sellerProfile = null;
                if (!sellerSnap.empty) {
                    const tempSellerProfile = sellerSnap.docs[0].data();
                    sellerProfile = await enforceSubscriptionStatus(tempSellerProfile, currentUser.uid);
                }
                const responseData = {
                    success: true,
                    user: {
                        ...userData,
                        ...(sellerProfile ? { seller_profile: sellerProfile } : {}),
                    },
                };
                //cache.set(cacheKey, responseData, 60000);
                return sendSuccess(res, {
                    user: {
                        ...userData,
                        ...(sellerProfile ? { seller_profile: sellerProfile } : {}),
                    }
                }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
