// firebase-functions/src/seller/updateSellerProfile.ts
import { Request, Response, NextFunction } from "express";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

// Helper function to generate unique offer ID
function generateOfferId(sellerId: string, index: number): string {
    return `${sellerId}_offer_${index}`;
}

// Helper function to auto-generate offer IDs
function autoGenerateOfferIds(offers: any[], sellerId: string): any[] {
    if (!Array.isArray(offers)) {
        return [];
    }

    return offers.map((offer, index) => {
        // If offer already has an ID, keep it
        if (offer.reward_id && offer.reward_id.trim() !== "") {
            return offer;
        }

        // Generate new offer ID
        return {
            ...offer,
            status: 'active',
            reward_id: generateOfferId(sellerId, index + 1),
            created_at: new Date(),
        };
    });
}

// Helper function to validate and prepare offers data
function prepareOffersData(offersData: any, existingOffers: any[], sellerId: string): any {
    if (!offersData || !Array.isArray(offersData)) {
        return existingOffers;
    }

    // Check if we have offers array or offers object
    if (Array.isArray(offersData)) {
        // If offers is an array, auto-generate IDs
        return autoGenerateOfferIds(offersData, sellerId);
    }

    return existingOffers;
}

export const updateSellerProfileHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
                "business",
                "location",
                "verification",
                "rewards",
                "payment",
            ];

            if (!validSections.includes(section)) {
                return sendError(res, ErrorCodes.INVALID_INPUT, `Invalid section. Allowed: ${validSections.join(", ")}`, HttpStatus.BAD_REQUEST);
            }

            const sellerId = currentUser.uid;
            const sellerRef = db.collection("seller_profiles").doc(sellerId);
            const sellerDoc = await sellerRef.get();

            if (!sellerDoc.exists) {
                return sendError(res, ErrorCodes.NOT_FOUND, "Seller profile not found", HttpStatus.NOT_FOUND);
            }

            const sellerProfile = sellerDoc.data() ?? {};

            // Prepare update payload
            let updatePayload: any = {
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
            };

            // Handle rewards section specially for offer ID generation
            if (section === "payment") {
                // Payment VPA is read-only — managed only through seller onboarding/setup
                return sendError(res, ErrorCodes.FORBIDDEN, "Payment VPA cannot be updated through this endpoint. Manage VPA in profile setup.", HttpStatus.FORBIDDEN);
            }
            // Handle rewards section specially for offer ID generation
            else if (section === "rewards") {
                const existingRewards = sellerProfile.rewards || {};
                const existingOffers = existingRewards.offers || [];

                let updatedRewards = { ...existingRewards };

                // ✅ If offers are being updated
                if (data.offers) {
                    const preparedOffers = prepareOffersData(data.offers, existingOffers, sellerId);
                    updatedRewards.offers = preparedOffers;
                }

                updatedRewards.noEdit = true;

                // ✅ Merge remaining reward fields safely (no duplication)
                const { offers, ...otherRewardData } = data;
                updatedRewards = {
                    ...updatedRewards,
                    ...otherRewardData
                };

                updatePayload["rewards"] = updatedRewards;
            }
            else {
                // For other sections, merge with existing data
                updatePayload[section] = {
                    ...sellerProfile[section],
                    ...data
                };
            }

            // Business rule: prevent modifying verification status directly
            if (section === "verification") {
                delete updatePayload.verification?.status;
                delete updatePayload.verification?.is_verified;
            }

            // Update DB
            await sellerRef.update(updatePayload);

            // Get updated document
            const updatedDoc = await sellerRef.get();
            const updatedData = updatedDoc.data();

            return sendSuccess(res, {
                message: `${section} section updated successfully`,
                updated: updatePayload,
                seller_profile: updatedData
            }, HttpStatus.OK);
    } catch (error: any) {
        if (error.code === "auth/argument-error") {
            return sendError(res, ErrorCodes.UNAUTHORIZED, "Invalid or expired token", HttpStatus.UNAUTHORIZED);
        }
        next(error);
    }
};