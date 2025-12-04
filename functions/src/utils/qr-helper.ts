import * as qrcode from 'qrcode';
import * as crypto from 'crypto';

export const generateHiddenCode = (length: number = 8): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

export const generateQRBase64 = async (data: string): Promise<string> => {
    try {
        const qrDataUrl = await qrcode.toDataURL(data, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        return qrDataUrl;
    } catch (error) {
        throw new Error(`QR generation failed: ${error}`);
    }
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

export const generateQRId = (): string => {
    return crypto.randomBytes(12).toString('hex');
};

// utils/qr-helper.ts - Add these functions

export function generateRedemptionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `RED_${timestamp}_${random}`.toUpperCase();
}

export function isRedemptionQR(data: string): boolean {
    try {
        const parsed = JSON.parse(data);
        return parsed.type === "redemption";
    } catch {
        return false;
    }
}

export function parseRedemptionQR(data: string): {
    type: string;
    redemption_id: string;
    seller_id: string;
    user_id: string;
    points: number;
    timestamp: number;
    hash: string;
} | null {
    try {
        const parsed = JSON.parse(data);
        if (parsed.type === "redemption" &&
            parsed.redemption_id &&
            parsed.seller_id &&
            parsed.user_id) {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}