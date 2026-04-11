import { z } from "zod";

export const registerPushTokenSchema = z.object({
    push_token: z.string().min(1, "push_token required"),
    platform: z.string().optional(),
    device_name: z.string().optional(),
    device_model: z.string().optional(),
});

export const unregisterPushTokenSchema = z.object({
    push_token: z.string().min(1, "push_token required"),
});

export const markNotificationsReadSchema = z.object({
    notificationIds: z.array(z.string()).min(1, "notificationIds must be a non-empty array"),
});
