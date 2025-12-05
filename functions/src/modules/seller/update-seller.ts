// firebase-functions/src/seller/updateSellerProfile.ts
import * as functions from "firebase-functions";
import { db, adminRef } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

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
            created_at: adminRef.firestore.FieldValue.serverTimestamp(),
            updated_at: adminRef.firestore.FieldValue.serverTimestamp()
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

export const updateSellerProfile = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "PATCH") {
                return res.status(405).json({ error: "PATCH method required" });
            }

            // Authenticate
            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser || !currentUser.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const { section, data } = req.body;

            if (!section || !data) {
                return res.status(400).json({
                    error: "Missing required fields: section, data",
                });
            }

            // Allowed updatable sections
            const validSections = [
                "account",
                "business",
                "location",
                "verification",
                "rewards",
            ];

            if (!validSections.includes(section)) {
                return res.status(400).json({
                    error: `Invalid section. Allowed: ${validSections.join(", ")}`,
                });
            }

            const sellerId = currentUser.uid;
            const sellerRef = db.collection("seller_profiles").doc(sellerId);
            const sellerDoc = await sellerRef.get();

            if (!sellerDoc.exists) {
                return res.status(404).json({ error: "Seller profile not found" });
            }

            const sellerProfile = sellerDoc.data() ?? {};

            // Prepare update payload
            let updatePayload: any = {
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
            };

            // Handle rewards section specially for offer ID generation
            if (section === "rewards") {
                const existingRewards = sellerProfile.rewards || {};
                const existingOffers = existingRewards.offers || [];

                // Check if we're updating offers
                if (data.offers) {
                    const preparedOffers = prepareOffersData(data.offers, existingOffers, sellerId);
                    updatePayload["rewards.offers"] = preparedOffers;

                    // Remove offers from data to avoid duplication
                    const { offers, ...otherRewardData } = data;
                    if (Object.keys(otherRewardData).length > 0) {
                        updatePayload["rewards"] = {
                            ...existingRewards,
                            ...otherRewardData
                        };
                    }
                } else {
                    // Update other reward fields
                    updatePayload["rewards"] = {
                        ...existingRewards,
                        ...data
                    };
                }
            } else {
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

            return res.status(200).json({
                success: true,
                message: `${section} section updated successfully`,
                updated: updatePayload,
                seller_profile: updatedData
            });
        } catch (error: any) {
            console.error("Update seller profile error:", error);

            if (error.code === "auth/argument-error") {
                return res.status(401).json({ error: "Invalid or expired token" });
            }

            return res.status(500).json({
                error: "Failed to update profile. Please try again.",
            });
        }
    });
});