import { createCallableFunction } from "../../utils/callable";
import { db, adminRef } from "../../config/firebase";

function generateOfferId(sellerId: string, index: number): string {
  return `${sellerId}_offer_${index}`;
}

function autoGenerateOfferIds(offers: any[], sellerId: string): any[] {
  if (!Array.isArray(offers)) {
    return [];
  }
  return offers.map((offer, index) => {
    if (offer.reward_id && offer.reward_id.trim() !== "") {
      return offer;
    }
    return {
      ...offer,
      status: "active",
      reward_id: generateOfferId(sellerId, index + 1),
      created_at: new Date(),
    };
  });
}

function prepareOffersData(offersData: any, existingOffers: any[], sellerId: string): any {
  if (!offersData || !Array.isArray(offersData)) {
    return existingOffers;
  }
  return autoGenerateOfferIds(offersData, sellerId);
}

interface UpdateSellerRequest {
  section: "account" | "business" | "location" | "verification" | "rewards";
  data: any;
}

export const updateSellerProfile = createCallableFunction<UpdateSellerRequest, any>(
  async (data, auth) => {
    const { section, data: updateData } = data;

    if (!section || !updateData) {
      throw new Error("Missing required fields: section, data");
    }

    const validSections = ["account", "business", "location", "verification", "rewards"];
    if (!validSections.includes(section)) {
      throw new Error(`Invalid section. Allowed: ${validSections.join(", ")}`);
    }

    const sellerId = auth!.uid;
    const sellerRef = db.collection("seller_profiles").doc(sellerId);
    const sellerDoc = await sellerRef.get();

    if (!sellerDoc.exists) {
      throw new Error("Seller profile not found");
    }

    const sellerProfile = sellerDoc.data() ?? {};
    let updatePayload: any = {
      updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
    };

    if (section === "rewards") {
      const existingRewards = sellerProfile.rewards || {};
      const existingOffers = existingRewards.offers || [];
      let updatedRewards = { ...existingRewards };

      if (updateData.offers) {
        const preparedOffers = prepareOffersData(updateData.offers, existingOffers, sellerId);
        updatedRewards.offers = preparedOffers;
      }

      updatedRewards.noEdit = true;
      const { offers, ...otherRewardData } = updateData;
      updatedRewards = {
        ...updatedRewards,
        ...otherRewardData,
      };

      updatePayload["rewards"] = updatedRewards;
    } else {
      updatePayload[section] = {
        ...sellerProfile[section],
        ...updateData,
      };
    }

    if (section === "verification") {
      delete updatePayload.verification?.status;
      delete updatePayload.verification?.is_verified;
    }

    // Update and fetch updated document in parallel
    const [, updatedDoc] = await Promise.all([
      sellerRef.update(updatePayload),
      sellerRef.get(),
    ]);

    const updatedData = updatedDoc.data();

    return {
      success: true,
      message: `${section} section updated successfully`,
      updated: updatePayload,
      seller_profile: updatedData,
    };
  },
  { region: "asia-south1", requireAuth: true }
);