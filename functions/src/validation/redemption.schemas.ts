import { z } from "zod";

export const createRedemptionSchema = z.object({
    seller_id: z.string().min(1, "seller_id required"),
    points: z.number().int().positive("points must be a positive integer"),
    offer_id: z.string().optional(),
    offer_name: z.string().optional(),
});

export const processRedemptionSchema = z.object({
    redemption_id: z.string().min(1, "redemption_id required"),
    seller_notes: z.string().optional(),
});

export const cancelRedemptionSchema = z.object({
    redemption_id: z.string().min(1, "redemption_id required"),
});

export const markRedemptionAsExpiredSchema = z.object({
    redemption_id: z.string().min(1, "redemption_id required"),
});

export const verifyRedeemCodeSchema = z.object({
    redeem_code: z.string().min(1, "redeem_code required"),
});
