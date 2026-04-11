import { z } from "zod";

export const updateSellerProfileSchema = z.object({
    section: z.string().min(1, "section required"),
    data: z.record(z.unknown()),
});

export const updateSellerMediaSchema = z.object({
    logo: z.string().optional(),
    banner: z.string().optional(),
}).refine((d: { logo?: string; banner?: string }) => d.logo !== undefined || d.banner !== undefined, {
    message: "At least one of logo or banner is required",
});

const offerSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().min(1, "offer title required"),
    min_spend: z.number().nonnegative(),
    points_value: z.number().nonnegative().optional(),
    reward_id: z.string().optional(),
    status: z.string().optional(),
}).passthrough();

export const saveSellerOfferSchema = z.union([
    z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
        start_date: z.undefined().optional(),
        end_date: z.undefined().optional(),
        offers: z.array(offerSchema).min(2).max(15),
    }),
    z.object({
        date: z.undefined().optional(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD"),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD"),
        offers: z.array(offerSchema).min(2).max(15),
    }),
]);
