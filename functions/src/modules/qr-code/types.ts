import { adminRef } from "../../config/firebase";

export interface QRCodeGenerateRequest {
    amount?: number;
    expires_in_minutes?: number;
    batch_size?: number;
    qr_code_type?: string
}

export interface QRCodeScanRequest {
    qr_id: string;
    hidden_code?: string;
    user_lat?: number;
    user_lng?: number;
    payment_amount: number;
    payment_based: number;
}

export interface QRCodeResponse {
    qr_id: string;
    qr_code_base64: string;
    qr_type: string;
    expires_at?: adminRef.firestore.Timestamp | Date | null;
    hidden_code?: string | null;
}

export interface QRCodeBatchResponse {
    qr_codes: QRCodeResponse[];
    total_generated: number;
}

export interface ScanResponse {
    message: string;
    qr_type: string;
    points_earned: number;
    total_points: number;
    seller_name: string;
}