import { z } from "zod";

export const updateUserProfileSchema = z.object({
    section: z.enum(["account", "location", "payment"]),
    data: z.record(z.unknown()),
});

export const assignTodayOfferSchema = z.object({
    seller_id: z.string().min(1, "seller_id required"),
});

export const redeemTodayOfferSchema = z.object({
    seller_id: z.string().min(1, "seller_id required"),
});
