import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

// Distance calculator (Haversine Formula)
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radius of earth in KM
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export const getNearbySellers = functions.https.onRequest(
    { region: 'asia-south1' }, (req, res) => {
        corsHandler(req, res, async () => {

            if (req.method !== "GET") {
                return res.status(405).json({ error: "GET only" });
            }

            try {
                // Authentication
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                const userId = currentUser.uid;

                // ---------------------------------------------------
                // 1️⃣ Extract user's current location if provided
                // ---------------------------------------------------
                let userLat = req.query.lat ? Number(req.query.lat) : null;
                let userLng = req.query.lng ? Number(req.query.lng) : null;

                // ---------------------------------------------------
                // 2️⃣ If missing -> use customer_profiles location
                // ---------------------------------------------------
                if (!userLat || !userLng) {
                    const customerDoc = await db.collection("customer_profiles")
                        .doc(userId)
                        .get();

                    if (customerDoc.exists) {
                        const c = customerDoc.data();
                        userLat = c?.location?.lat;
                        userLng = c?.location?.lng;
                    }
                }

                if (!userLat || !userLng) {
                    return res.status(400).json({ error: "User location not available" });
                }

                // ---------------------------------------------------
                // 3️⃣ Fetch all active sellers with lat/lng available
                // ---------------------------------------------------
                const sellerDocs = await db.collection("seller_profiles").get();

                const nearbySellers: any[] = [];

                const today = new Date().toISOString().slice(0, 10);

                // Fetch all sellers who have offers today
                const todayOffersSnap = await db
                    .collection("seller_daily_offers")
                    .where("date", "==", today)
                    .where("status", "==", "Active")
                    .get();

                // Build lookup set
                const perksSellerSet = new Set<string>();

                todayOffersSnap.forEach(doc => {
                    const data = doc.data();
                    if (data?.seller_id && Array.isArray(data?.offers) && data.offers.length > 0) {
                        perksSellerSet.add(data.seller_id);
                    }
                });


                sellerDocs.forEach((doc) => {
                    const s = doc.data();

                    const sLat = s?.location?.lat;
                    const sLng = s?.location?.lng;

                    if (!sLat || !sLng) return;

                    // Calculate distance
                    const distanceKm = getDistanceKm(userLat!, userLng!, sLat, sLng);
                    const sellerId = s.user_id;
                    // Only include within 1 km radius
                    if (distanceKm <= 1) {
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
                            logo: s.media?.logo_url || '',
                            banner: s.media?.banner_url || '',
                            reward_description: getRewardDescription(s.rewards),
                            lat: sLat,
                            lng: sLng,
                            distance_km: Number(distanceKm.toFixed(3)),
                            perksAvailable: perksSellerSet.has(sellerId),
                        });
                    }
                });

                // ---------------------------------------------------
                // 4️⃣ Sort nearest first
                // ---------------------------------------------------
                nearbySellers.sort((a, b) => {
                    if (a.perksAvailable === b.perksAvailable) {
                        return a.distance_km - b.distance_km;
                    }
                    return a.perksAvailable ? -1 : 1;
                });


                return res.status(200).json({
                    success: true,
                    total: nearbySellers.length,
                    sellers: nearbySellers,
                });

            } catch (error: any) {
                console.error("listNearbySellers Error:", error);
                return res.status(500).json({ error: error.message || "Internal server error" });
            }
        });
    });


function getRewardDescription(rewardConfig: any) {
    const rewardType = rewardConfig.reward_type || 'default';
    const rewardPoints = rewardConfig.reward_points || rewardConfig.default_points_value || 100;
    switch (rewardType) {
        case 'percentage':
            const percentage = rewardConfig.percentage_value || 1;
            return {
                type: rewardType,
                text: `Earn ${percentage}% of total order as points`
            };

        case 'flat':
            const flatPoints = rewardConfig.flat_points || 1;
            return {
                type: rewardType,
                text: `Earn ${flatPoints} points per transaction`
            };

        case 'slab':
            if (Array.isArray(rewardConfig.slab_rules) && rewardConfig.slab_rules.length > 0) {
                const rules = rewardConfig.slab_rules.map((rule: any) =>
                    `₹${rule.min}-₹${rule.max}: ${rule.points}pts`
                );
                return {
                    type: rewardType,
                    text: rules
                };
            }
            return {
                type: rewardType,
                text: `Earn points based on amount spent`
            };

        case 'default':
        default:
            return {
                type: 'default',
                text: `Earn ${rewardPoints} points per transaction`
            };
    }
}