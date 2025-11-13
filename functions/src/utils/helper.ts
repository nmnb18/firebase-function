import { adminRef, db } from "../config/firebase";

const getMonthlyQRLimit = (tier: string): number => {
    const limits = {
        'free': 10,
        'pro': 1000,
        'enterprise': 10000
    };
    return limits[tier as keyof typeof limits] || 10;
};

const getSubscriptionFeatures = (tier: string): string[] => {
    const features = {
        'free': ['basic_analytics', 'dynamic_qr', 'static_qr'],
        'pro': ['advanced_analytics', 'fixed_selected_unlimited_qr'],
        'premium': ['advanced_analytics', 'unlimited_qr', 'custom_branding']
    };
    return features[tier as keyof typeof features] || ['basic_analytics'];
};

const getSubscriptionPrice = (tier: string): number => {
    const prices = {
        'free': 0,
        'pro': 299,
        'premium': 2999
    };
    return prices[tier as keyof typeof prices] || 0;
};

const getSubscriptionEndDate = (): any => {
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1); // 1 month from now
    return adminRef.firestore.Timestamp.fromDate(endDate);
};

const sendWelcomeEmail = async (email: string, name: string, shopName: string): Promise<void> => {
    // Implement your email service here (SendGrid, Mailgun, etc.)
    // This is a placeholder implementation
    console.log(`Welcome email sent to ${email} for ${shopName}`);
};
const generateInternalOrderId = async () => {
    const paymentsSnap = await db.collection("payments").get();
    const count = paymentsSnap.size + 1;

    // Always 3 digits: 001, 002, 003...
    const padded = String(count).padStart(3, "0");
    return `GBT-${padded}`;
}

export {
    sendWelcomeEmail,
    getSubscriptionFeatures,
    getMonthlyQRLimit,
    getSubscriptionEndDate,
    getSubscriptionPrice,
    generateInternalOrderId
}