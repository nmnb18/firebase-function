// Add to your existing types or create new file: types/redemption.ts
export interface Redemption {
    redemption_id: string;          // Unique redemption ID (RED_123456)
    seller_id: string;             // Seller's ID
    user_id: string;               // Customer's ID
    user_name: string;             // Customer name for seller display
    user_email: string;            // Customer email
    seller_name: string;           // Seller name
    seller_shop_name: string;      // Shop name
    points: number;                // Points to redeem
    status: 'pending' | 'redeemed' | 'cancelled' | 'expired';
    offer_id?: string;             // Optional: specific offer ID
    offer_name?: string;           // Offer name if any
    qr_data: string;              // Encoded QR data
    qr_image_url?: string;        // Optional: stored QR image
    created_at: Date | FirebaseFirestore.Timestamp;
    updated_at: Date | FirebaseFirestore.Timestamp;
    redeemed_at?: Date | FirebaseFirestore.Timestamp;
    expires_at: Date | FirebaseFirestore.Timestamp; // 24hr expiry
    transaction_id?: string;       // Optional payment gateway reference
    metadata?: {
        original_offer?: any;        // Snapshot of offer details
        customer_notes?: string;
        seller_notes?: string;
    };
}

export interface RedemptionRequest {
    seller_id: string;
    points: number;
    offer_id?: string;
    offer_name?: string;
}

export interface RedemptionResponse {
    success: boolean;
    redemption_id: string;
    qr_code_base64: string;
    qr_data: string;
    expires_at: Date;
    status: string;
}