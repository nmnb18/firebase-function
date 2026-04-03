/**
 * Shared utilities for points-earning transactions (QR scan + UPI payment)
 * 
 * Extracted from scanUserQRCodeHandler to eliminate duplication with
 * confirmUPIPaymentAndAwardPointsHandler.
 */

import { adminRef, db } from "../config/firebase";
import pushService, { NotificationChannel, NotificationType } from "../services/expo-service";
import { saveNotification } from "./helper";

/**
 * Check if user has ever earned points from this seller before
 */
export async function isNewCustomer(userId: string, sellerId: string): Promise<boolean> {
    const pointsQuery = await db.collection("points")
        .where("user_id", "==", userId)
        .where("seller_id", "==", sellerId)
        .limit(1)
        .get();
    return pointsQuery.empty;
}

/**
 * Update seller stats: monthly scans, total scans, points distributed,
 * active customers (if new), first scan bonus tracking (if new + bonus enabled)
 */
export async function updateSellerStats(
    sellerId: string,
    pointsEarned: number,
    isNewCustomer: boolean = false,
    isFirstScanBonus: boolean = false
): Promise<void> {
    const sellerRef = db.collection("seller_profiles").doc(sellerId);

    const now = new Date();
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const currentMonthKey = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();
    const monthlyScanKey = `stats.monthly_scans.${currentYear}.${currentMonthKey}`;

    const sellerDoc = await sellerRef.get();
    const sellerData = sellerDoc.data();

    const updateData: any = {
        "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
        "stats.total_points_distributed": adminRef.firestore.FieldValue.increment(pointsEarned),
    };

    const currentMonthlyScans = sellerData?.stats?.monthly_scans || {};
    const currentYearScans = currentMonthlyScans[currentYear] || {};
    const currentMonthCount = currentYearScans[currentMonthKey] || 0;
    updateData[monthlyScanKey] = currentMonthCount + 1;

    if (isNewCustomer) {
        updateData["stats.active_customers"] = adminRef.firestore.FieldValue.increment(1);
        if (isFirstScanBonus) {
            updateData["stats.first_scan_bonus_given"] = adminRef.firestore.FieldValue.increment(1);
        }
    }

    await sellerRef.update(updateData);
}

/**
 * Update or create points record for user-seller pair
 */
export async function updatePointsCollection(
    userId: string,
    sellerId: string,
    pointsEarned: number
): Promise<number> {
    const docId = `${userId}_${sellerId}`;
    const ref = db.collection("points").doc(docId);
    await ref.set({
        user_id: userId,
        seller_id: sellerId,
        points: adminRef.firestore.FieldValue.increment(pointsEarned),
        last_updated: new Date(),
        created_at: new Date(),
    }, { merge: true });
    const updated = await ref.get();
    return (updated.data()?.points as number) || pointsEarned;
}

/**
 * Create a daily_scans record
 */
export async function createDailyScanRecord(
    userId: string,
    sellerId: string,
    source: "qr_scan" | "upi_payment" = "qr_scan"
): Promise<void> {
    await db.collection("daily_scans").add({
        user_id: userId,
        seller_id: sellerId,
        scan_date: new Date(),
        scanned_at: new Date(),
        source,
    });
}

/**
 * Send push notifications to both user and seller after points are earned
 */
export async function sendPointsEarnedNotifications(
    userId: string,
    sellerId: string,
    pointsEarned: number,
    sellerName: string,
    customerName: string
): Promise<void> {
    // Save notifications to Firestore (in-app notification inbox)
    await Promise.all([
        saveNotification(
            userId,
            "⭐ Points Credited!",
            `You earned ${pointsEarned} points at ${sellerName}`,
            {
                type: NotificationType.POINTS_EARNED,
                screen: "/(drawer)/(tabs)/wallet",
                sellerId,
                points: pointsEarned,
            }
        ),
        saveNotification(
            sellerId,
            "⭐ Points Credited!",
            `Customer ${customerName} earned ${pointsEarned} points at your store.`,
            {
                type: NotificationType.POINTS_EARNED,
                screen: "/(drawer)/(tabs)/wallet",
                sellerId,
                points: pointsEarned,
            }
        ),
    ]);

    // Fetch push tokens for both parties
    const [userTokenSnap, sellerTokenSnap] = await Promise.all([
        db.collection("push_tokens").where("user_id", "==", userId).get(),
        db.collection("push_tokens").where("user_id", "==", sellerId).get(),
    ]);

    const userTokens = userTokenSnap.docs.map((d) => d.data().token);
    const sellerTokens = sellerTokenSnap.docs.map((d) => d.data().token);

    // Send push notifications (non-blocking, errors logged but not thrown)
    await Promise.all([
        userTokens.length > 0
            ? pushService.sendToUser(
                  userTokens,
                  "⭐ Points Credited!",
                  `You earned ${pointsEarned} points at ${sellerName}`,
                  {
                      type: NotificationType.POINTS_EARNED,
                      screen: "/(drawer)/(tabs)/wallet",
                      params: { sellerId, points: pointsEarned },
                  },
                  NotificationChannel.ORDERS
              ).catch((err) => console.error("User push failed:", err))
            : Promise.resolve(),
        sellerTokens.length > 0
            ? pushService.sendToUser(
                  sellerTokens,
                  "⭐ Points Credited!",
                  `Customer ${customerName} earned ${pointsEarned} points at your store.`,
                  {
                      type: NotificationType.NEW_ORDER,
                      screen: "/(drawer)/redemptions",
                  },
                  NotificationChannel.ORDERS
              ).catch((err) => console.error("Seller push failed:", err))
            : Promise.resolve(),
    ]);
}

/**
 * Activate user if this is their first interaction with the platform
 */
export async function activateUserIfFirstTime(
    userId: string,
    sellerId: string
): Promise<void> {
    const userRef = db.collection("customer_profiles").doc(userId);
    const sellerRef = db.collection("seller_profiles").doc(sellerId);

    await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);

        if (!userSnap.exists) return;

        const activation = userSnap.data()?.activation;

        // Already activated → do nothing
        if (activation?.activated_by) return;

        // Mark user activated
        tx.update(userRef, {
            "activation.activated_by": sellerId,
            "activation.activated_at": adminRef.firestore.FieldValue.serverTimestamp(),
        });

        // Increment seller activation count
        tx.update(sellerRef, {
            "stats.users_activated": adminRef.firestore.FieldValue.increment(1),
        });
    });
}

/**
 * Atomic batch write for points-earning transaction
 * 
 * Handles:
 * - Updating customer loyalty points and stats
 * - Creating transaction record
 * - Updating seller basic stats (not monthly - use updateSellerStats for that)
 * - Optionally marking UPI order as completed
 * 
 * Used by: QR scan, UPI payment confirmation, Razorpay webhook
 */
export interface PointsTransactionData {
    userId: string;
    sellerId: string;
    sellerName: string;
    pointsEarned: number;
    basePoints: number;
    bonusPoints: number;
    transactionType: "qr_scan" | "upi_payment";
    amount: number; // in paise
    description: string;
    customerName?: string; // Optional for QR scan (will be "Customer" if not provided)
    
    // UPI-specific fields (optional)
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    orderRef?: FirebaseFirestore.DocumentReference; // If provided, marks order as completed
    completedVia?: "user_app" | "webhook"; // For order completion tracking
}

export async function createPointsEarningTransaction(
    data: PointsTransactionData
): Promise<void> {
    const batch = db.batch();
    const now = adminRef.firestore.FieldValue.serverTimestamp();

    // 1. If UPI order provided, mark it as completed
    if (data.orderRef && data.razorpayPaymentId) {
        batch.update(data.orderRef, {
            status: "completed",
            razorpay_payment_id: data.razorpayPaymentId,
            completed_at: now,
            ...(data.completedVia && { completed_via: data.completedVia }),
        });
    }

    // 2. Create transaction record
    const txRef = db.collection("transactions").doc();
    const transactionData: any = {
        user_id: data.userId,
        seller_id: data.sellerId,
        seller_name: data.sellerName,
        type: data.transactionType,
        amount: data.amount,
        points_earned: data.pointsEarned,
        base_points: data.basePoints,
        bonus_points: data.bonusPoints,
        description: data.description,
        created_at: now,
    };

    if (data.customerName) {
        transactionData.customer_name = data.customerName;
    }

    if (data.transactionType === "qr_scan") {
        transactionData.transaction_type = "earn";
        transactionData.qr_type = "user";
        transactionData.timestamp = new Date();
    }

    if (data.razorpayOrderId) {
        transactionData.razorpay_order_id = data.razorpayOrderId;
    }
    if (data.razorpayPaymentId) {
        transactionData.razorpay_payment_id = data.razorpayPaymentId;
    }

    batch.set(txRef, transactionData);

    // 3. Update customer profile
    const customerRef = db.collection("customer_profiles").doc(data.userId);
    batch.update(customerRef, {
        "stats.loyalty_points": adminRef.firestore.FieldValue.increment(data.pointsEarned),
        "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
        "stats.visited_sellers": adminRef.firestore.FieldValue.arrayUnion(data.sellerId),
        "stats.updated_at": now,
    });

    // 4. Update seller basic stats (monthly stats handled separately by updateSellerStats)
    const sellerRef = db.collection("seller_profiles").doc(data.sellerId);
    batch.update(sellerRef, {
        "stats.total_scans": adminRef.firestore.FieldValue.increment(1),
        "stats.total_points_distributed": adminRef.firestore.FieldValue.increment(data.pointsEarned),
    });

    await batch.commit();
}
