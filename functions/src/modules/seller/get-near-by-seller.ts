import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";

const SEARCH_RADIUS_KM = 25;

// Distance calculator (Haversine Formula)
function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of earth in KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getRewardDescription(rewardConfig: any): any {
  const rewardType = rewardConfig.reward_type || "default";
  const rewardPoints =
    rewardConfig.reward_points || rewardConfig.default_points_value || 100;

  switch (rewardType) {
    case "percentage":
      const percentage = rewardConfig.percentage_value || 1;
      return {
        type: rewardType,
        text: `Earn ${percentage}% of total order as points`,
      };

    case "flat":
      const flatPoints = rewardConfig.flat_points || 1;
      return {
        type: rewardType,
        text: `Earn ${flatPoints} points per transaction`,
      };

    case "slab":
      if (
        Array.isArray(rewardConfig.slab_rules) &&
        rewardConfig.slab_rules.length > 0
      ) {
        const rules = rewardConfig.slab_rules.map(
          (rule: any) => `₹${rule.min}-₹${rule.max}: ${rule.points}pts`
        );
        return {
          type: rewardType,
          text: rules,
        };
      }
      return {
        type: rewardType,
        text: "Earn points based on amount spent",
      };

    case "default":
    default:
      return {
        type: "default",
        text: `Earn ${rewardPoints} points per transaction`,
      };
  }
}

interface GetNearbyRequest {
  lat?: number;
  lng?: number;
}

export const getNearbySellers = createCallableFunction<
  GetNearbyRequest,
  any
>(
  async (data, auth) => {
    const userId = auth!.uid;
    let userLat = data?.lat;
    let userLng = data?.lng;

    // If location not provided, fetch from customer profile
    if (!userLat || !userLng) {
      const customerDoc = await db
        .collection("customer_profiles")
        .doc(userId)
        .get();

      if (customerDoc.exists) {
        const c = customerDoc.data();
        userLat = c?.location?.lat;
        userLng = c?.location?.lng;
      }
    }

    if (!userLat || !userLng) {
      throw new Error("User location not available");
    }

    // Fetch all sellers and today's offers in parallel
    const [sellerDocs, todayOffersSnap] = await Promise.all([
      db.collection("seller_profiles").get(),
      db
        .collection("seller_daily_offers")
        .where("date", "==", new Date().toISOString().slice(0, 10))
        .where("status", "==", "Active")
        .get(),
    ]);

    // Build lookup set for sellers with perks
    const perksSellerSet = new Set<string>();
    todayOffersSnap.forEach((doc) => {
      const data = doc.data();
      if (
        data?.seller_id &&
        Array.isArray(data?.offers) &&
        data.offers.length > 0
      ) {
        perksSellerSet.add(data.seller_id);
      }
    });

    // Process sellers and calculate distances
    const nearbySellers: any[] = [];

    sellerDocs.forEach((doc) => {
      const s = doc.data();
      const sLat = s?.location?.lat;
      const sLng = s?.location?.lng;

      if (!sLat || !sLng) return;

      // Calculate distance
      const distanceKm = getDistanceKm(userLat!, userLng!, sLat, sLng);
      const sellerId = s.user_id;

      // Only include within search radius
      if (distanceKm <= SEARCH_RADIUS_KM) {
        nearbySellers.push({
          id: sellerId,
          shop_name: s.business?.shop_name,
          category: s.business?.category,
          business_type: s.business?.business_type,
          description: s.business?.description,
          points_per_visit: s.rewards?.default_points_value || 1,
          reward_points: s.stats?.total_points_distributed || 0,
          address: `${s.location.address.street}, ${s.location.address.city} - ${s.location.address.pincode}`,
          phone: s.account.phone,
          logo: s.media?.logo_url || "",
          banner: s.media?.banner_url || "",
          reward_description: getRewardDescription(s.rewards),
          lat: sLat,
          lng: sLng,
          distance_km: Number(distanceKm.toFixed(3)),
          perksAvailable: perksSellerSet.has(sellerId),
        });
      }
    });

    // Sort: sellers with perks first, then by distance
    nearbySellers.sort((a, b) => {
      if (a.perksAvailable === b.perksAvailable) {
        return a.distance_km - b.distance_km;
      }
      return a.perksAvailable ? -1 : 1;
    });

    return {
      success: true,
      total: nearbySellers.length,
      sellers: nearbySellers,
    };
  },
  { region: "asia-south1", requireAuth: true }
);