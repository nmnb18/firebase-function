import { adminRef } from "../config/firebase";

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
        'pro': ['advanced_analytics', 'unlimited_qr', 'custom_branding', 'api_access']
    };
    return features[tier as keyof typeof features] || ['basic_analytics'];
};

const getSubscriptionPrice = (tier: string): number => {
    const prices = {
        'free': 0,
        'pro': 999,
        'enterprise': 4999
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

export {
    sendWelcomeEmail,
    getSubscriptionFeatures,
    getMonthlyQRLimit,
    getSubscriptionEndDate,
    getSubscriptionPrice
}