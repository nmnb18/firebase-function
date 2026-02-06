import { adminRef, db } from "../../config/firebase";
import { calculateDistance } from "../../utils/qr-helper";
import { QRCodeScanRequest, ScanResponse } from "./types";
import { createCallableFunction } from "../../utils/callable";

// ============================================================
// INPUT / OUTPUT TYPES
// ============================================================
interface ScanQRInput {
    qr_id: string;
    user_lat?: number;
    user_lng?: number;
}

interface ScanQROutput {
    message: string;
    qr_type: string;
    points_earned: number;
    total_points: number;
    seller_name: string;
}

/** ----------------------------------------------------
 * UPDATE SELLER STATS with monthly breakdown
 * ---------------------------------------------------- */
async function updateSellerStats(sellerId: string, pointsEarned: number, isNewCustomer: boolean = false) {
    const sellerRef = db.collection("seller_profiles").doc(sellerId);

    // Get current date for monthly stats
    const now = new Date();
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const currentMonthKey = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();
    const monthlyScanKey = `stats.monthly_scans.${currentYear}.${currentMonthKey}`;

    // First, get the current document to update monthly scans properly
    const sellerDoc = await sellerRef.get();
    const sellerData = sellerDoc.data();

    const updateData: any = {
        "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
        "stats.total_points_distributed": adminRef.firestore.FieldValue.increment(pointsEarned)
    };

    // Update monthly scans - increment existing or set to 1 if doesn't exist
    const currentMonthlyScans = sellerData?.stats?.monthly_scans || {};
    const currentYearScans = currentMonthlyScans[currentYear] || {};
    const currentMonthCount = currentYearScans[currentMonthKey] || 0;

    updateData[monthlyScanKey] = currentMonthCount + 1;

    // Only increment active_customers if this is a new customer
    if (isNewCustomer) {
        updateData["stats.active_customers"] = adminRef.firestore.FieldValue.increment(1);
    }

    await sellerRef.update(updateData);
}

/** ----------------------------------------------------
 * CHECK IF USER IS NEW CUSTOMER FOR THIS SELLER
 * ---------------------------------------------------- */
async function isNewCustomer(userId: string, sellerId: string): Promise<boolean> {
    const pointsQuery = await db.collection("points")
        .where("user_id", "==", userId)
        .where("seller_id", "==", sellerId)
        .limit(1)
        .get();

    return pointsQuery.empty;
}

/** ----------------------------------------------------
 * UNIVERSAL REWARD CALCULATOR
 * Supports: flat | percentage | slab | default
 * ---------------------------------------------------- */
function calculateRewardPoints(amount: number, seller: any): number {
    const config = seller.rewards || {};

    switch (config.reward_type) {
        // 1️⃣ Percentage-based reward
        case "percentage":
            if (!config.percentage_value) return 0;
            return Math.round((config.percentage_value / 100) * amount);

        // 2️⃣ Flat fixed points
        case "flat":
            return config.flat_points || 0;

        // 3️⃣ Slab-based rewards
        case "slab":
            if (!Array.isArray(config.slab_rules)) return 0;

            for (const rule of config.slab_rules) {
                if (amount >= rule.min && amount <= rule.max) {
                    return rule.points;
                }
            }

            // amount > last slab
            const last = config.slab_rules[config.slab_rules.length - 1];
            if (amount > last.max) return last.points;

            return 0;

        // 4️⃣ Default points (QR points)
        case "default":
        default:
            return config.default_points_value || 1;
    }
}

/** ----------------------------------------------------
 * MAIN SCAN LOGIC (QR-only, no payment logic)
 * ---------------------------------------------------- */
export const scanQRCode = createCallableFunction<ScanQRInput, ScanQROutput>(
    async (data, auth) => {
        const {
            qr_id,
            user_lat,
            user_lng,
        } = data;

        if (!qr_id) {
            throw new Error("QR ID is required");
        }

        // -----------------------------------
        // Fetch QR Data
        // -----------------------------------
        const qrQuery = await db
            .collection("qr_codes")
            .where("qr_id", "==", qr_id)
            .limit(1)
            .get();

        if (qrQuery.empty) {
            throw new Error("Invalid QR code");
        }

        const qrDoc = qrQuery.docs[0];
        const qrData = qrDoc.data();

        const qrType = qrData.qr_type || "dynamic";
        const sellerId = qrData.seller_id;

        // -----------------------------------
        // Fetch Seller Profile
        // -----------------------------------
        const sellerDoc = await db.collection("seller_profiles").doc(sellerId).get();
        if (!sellerDoc.exists) {
            throw new Error("Seller not found");
        }
        const seller = sellerDoc.data();

        // Check if this is a new customer
        const newCustomer = await isNewCustomer(auth!.uid, sellerId);

        // Calculate points based on QR type
        const pointsValue = qrType === 'static' || qrType === 'multiple'
            ? qrData.points_value
            : calculateRewardPoints(qrData.amount, seller);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // ------------------------------
        // Dynamic/Static QR (one-time use)
        // ------------------------------
        if (qrType === 'static') {
            const dailyScanQuery = await db
                .collection("daily_scans")
                .where("qr_id", "==", qr_id)
                .where("user_id", "==", auth!.uid)
                .where('seller_id', "==", sellerId)
                .where("scan_date", "==", today)
                .limit(1)
                .get();

            if (!dailyScanQuery.empty) {
                throw new Error("QR code already used");
            }
        }
        if (qrType === "dynamic") {
            if (qrData.used) {
                throw new Error("QR code already used");
            }

            if (qrData.expires_at && qrData.expires_at.toDate() < new Date()) {
                throw new Error("QR code expired");
            }

            await qrDoc.ref.update({
                used: true,
                used_by: auth!.uid,
                used_at: new Date()
            });
        }



        // Location check
        if (seller?.location.lat && seller.location.lng) {
            if (!user_lat || !user_lng) {
                throw new Error("Location is required");
            }

            const distance = calculateDistance(
                seller.location_lat,
                seller.location_lng,
                user_lat,
                user_lng
            );

            const maxDistance = seller.location_radius_meters || 100;

            if (distance > maxDistance) {
                throw new Error(
                    `Too far from store. Must be within ${maxDistance}m`
                );
            }
        }
        await db.collection("daily_scans").add({
            user_id: auth!.uid,
            seller_id: sellerId,
            qr_id,
            scan_date: today,
            scanned_at: new Date()
        });

        // =====================================================
        // Allocate points for QR scan
        // =====================================================
        const pointsRef = db.collection("points");
        const pointsQuery = await pointsRef
            .where("user_id", "==", auth!.uid)
            .where("seller_id", "==", sellerId)
            .limit(1)
            .get();

        let newPoints = pointsValue;

        if (!pointsQuery.empty) {
            const ref = pointsQuery.docs[0].ref;
            const current = pointsQuery.docs[0].data().points || 0;

            newPoints = current + pointsValue;

            await ref.update({
                points: newPoints,
                last_updated: new Date()
            });
        } else {
            await pointsRef.add({
                user_id: auth!.uid,
                seller_id: sellerId,
                points: pointsValue,
                last_updated: new Date()
            });
        }

        // Add transaction
        await db.collection("transactions").add({
            user_id: auth!.uid,
            seller_id: sellerId,
            seller_name: seller?.business?.shop_name,
            points: pointsValue,
            transaction_type: "earn",
            qr_type: qrType,
            timestamp: new Date(),
            description: `Scanned ${qrType} QR - earned ${pointsValue} pts`
        });

        // 🔥 UPDATE SELLER STATS for QR scan
        await updateSellerStats(sellerId, pointsValue, newCustomer);

        return {
            message: "Points earned successfully",
            qr_type: qrType,
            points_earned: pointsValue,
            total_points: newPoints,
            seller_name: seller?.business?.shop_name,
        };
    },
    {
        region: "asia-south1",
        requireAuth: true,
    }
);