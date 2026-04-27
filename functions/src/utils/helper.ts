import axios from "axios";
import { adminRef, db } from "../config/firebase";

const getMonthlyScanLimit = (tier: string): number => {
    const limits = {
        'free': 300,
        'pro': 3000,
        'enterprise': 30000
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
        'pro': 499,
        'premium': 4999
    };
    return prices[tier as keyof typeof prices] || 0;
};

const getCurrentMonthScanCount = (seller: any): number => {
    const now = new Date();
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthKey = monthNames[now.getMonth()];
    const year = now.getFullYear();

    return (
        seller?.stats?.monthly_scans?.[year]?.[monthKey] || 0
    );
}

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
                email: 'support@yoperks.com',
                name: "yoPerks Support",
            },
            template_id: 'verify_mail',
            variables: {
                name,
                verification_link: `https://yoperks.com/verify-email?token=${verificationToken}`,
                year: 2026
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
const generateInternalOrderId = (): string => {
    // Use timestamp + random suffix — avoids full collection scan and is collision-resistant
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(Math.random() * 0xfff).toString(16).toUpperCase().padStart(3, "0");
    return `GBT-${ts}-${rand}`;
}

const generateRedeemCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `RED-GRAB-${result}`;
}

const resolveCityStatus = (city: string, settings: any) => {
    const normalizedCity = city.trim().toLowerCase();

    if (settings.enabled_cities?.includes(normalizedCity)) {
        return "LIVE";
    }

    if (settings.coming_soon_cities?.includes(normalizedCity)) {
        return "COMING_SOON";
    }

    return settings.default_status === "coming_soon"
        ? "COMING_SOON"
        : "DISABLED";
}

const saveNotification = async (userId: string, title: string, body: string, data: any) => {
    const notifRef = db.collection("user_notifications").doc(userId).collection("notifications").doc();
    await notifRef.set({
        title,
        body,
        data: data || {},
        read: false,
        created_at: adminRef.firestore.FieldValue.serverTimestamp(),
    });
}




export {
    saveNotification,
    sendVerificationEmail,
    getSubscriptionFeatures,
    getMonthlyScanLimit,
    getSubscriptionEndDate,
    getSubscriptionPrice,
    generateInternalOrderId,
    generateRedeemCode,
    getCurrentMonthScanCount,
    resolveCityStatus
}