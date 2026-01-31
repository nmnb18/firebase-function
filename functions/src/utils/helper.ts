import axios from "axios";
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

const sendVerificationEmail = async (email: string, name: string, verificationToken: string): Promise<void> => {
    // Implement your email service here (SendGrid, Mailgun, etc.)
    // This is a placeholder implementation

    await axios.post(
        "https://control.msg91.com/api/v5/email/send",
        {
            to: [
                {
                    email,
                    name,
                },
            ],
            from: {
                email: 'support@grabbitt.in',
                name: "Grabbitt Support",
            },
            template_id: 'verify_mail',
            variables: {
                name,
                verification_link: `https://grabbitt.in/verify-email?token=${verificationToken}`,
                year: 2025
            },
        },
        {
            headers: {
                authkey: '478648AmhpoC861T691da021P1',
                "Content-Type": "application/json",
            },
        }
    );

};
const generateInternalOrderId = async () => {
    const paymentsSnap = await db.collection("payments").get();
    const count = paymentsSnap.size + 1;

    // Always 3 digits: 001, 002, 003...
    const padded = String(count).padStart(3, "0");
    return `GBT-${padded}`;
}

const generateRedeemCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `RED-GRAB-${result}`;
}

export {
    sendVerificationEmail,
    getSubscriptionFeatures,
    getMonthlyQRLimit,
    getSubscriptionEndDate,
    getSubscriptionPrice,
    generateInternalOrderId,
    generateRedeemCode
}