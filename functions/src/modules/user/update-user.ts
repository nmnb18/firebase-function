import { Request, Response, NextFunction } from "express";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const updateUserProfileHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

                // Authenticate
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
                }

                const { section, data } = req.body;

                if (!section || !data) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Missing required fields: section, data", HttpStatus.BAD_REQUEST);
                }

                // Allowed updatable sections
                const validSections = [
                    "account",
                    "location",
                    "payment",
                ];

                if (!validSections.includes(section)) {
                    return sendError(res, ErrorCodes.INVALID_INPUT, `Invalid section. Allowed: ${validSections.join(", ")}`, HttpStatus.BAD_REQUEST);
                }

                const userId = currentUser.uid;
                const userRef = db.collection("customer_profiles").doc(userId);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    return sendError(res, ErrorCodes.NOT_FOUND, "Customer profile not found", HttpStatus.NOT_FOUND);
                }

                const customerProfile = userDoc.data() ?? {};

                // Prepare update payload
                let updatePayload: any = {
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                };

                if (section === "payment") {
                    // upi_vpa is stored as a top-level field on the customer profile
                    if (!data.upi_vpa || typeof data.upi_vpa !== "string") {
                        return sendError(res, ErrorCodes.INVALID_INPUT, "upi_vpa (string) is required for the payment section", HttpStatus.BAD_REQUEST);
                    }
                    updatePayload.upi_vpa = data.upi_vpa;
                } else {
                    updatePayload[section] = {
                        ...customerProfile[section],
                        ...data,
                    };
                }

                // Update DB
                await userRef.update(updatePayload);

                // Get updated document
                const updatedDoc = await userRef.get();
                const updatedData = updatedDoc.data();

                return sendSuccess(res, {
                    message: `${section} section updated successfully`,
                    updated: updatePayload,
                    customer_profile: updatedData
                }, HttpStatus.OK);
    } catch (error: any) {
        if (error.code === "auth/argument-error") {
            return sendError(res, ErrorCodes.UNAUTHORIZED, "Invalid or expired token", HttpStatus.UNAUTHORIZED);
        }
        next(error);
    }
};
