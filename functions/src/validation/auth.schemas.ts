import { z } from "zod";

export const loginSchema = z.object({
    email: z.string().email("Valid email required"),
    password: z.string().min(1, "Password required"),
    role: z.enum(["seller", "user"]),
});

export const registerUserSchema = z.object({
    name: z.string().min(1, "Name required"),
    phone: z.string().min(1, "Phone required"),
    email: z.string().email("Valid email required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    street: z.string().min(1, "Street required"),
    city: z.string().min(1, "City required"),
    state: z.string().min(1, "State required"),
    pincode: z.string().min(1, "Pincode required"),
    country: z.string().optional().default("India"),
    lat: z.number({ required_error: "lat required" }),
    lng: z.number({ required_error: "lng required" }),
});

const slabRuleSchema = z.object({
    min: z.number(),
    max: z.number(),
    points: z.number().int().nonnegative(),
});

export const registerSellerSchema = z.object({
    email: z.string().email("Valid email required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().min(1, "Name required"),
    shopName: z.string().min(1, "shopName required"),
    phone: z.string().min(1, "Phone required"),
    businessType: z.string().min(1, "businessType required"),
    category: z.string().min(1, "category required"),
    description: z.string().min(1, "description required"),
    street: z.string().min(1, "Street required"),
    city: z.string().min(1, "City required"),
    state: z.string().min(1, "State required"),
    pincode: z.string().min(1, "Pincode required"),
    country: z.string().optional().default("India"),
    enableLocation: z.boolean().optional().default(false),
    locationRadius: z.number().optional().default(100),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    gstNumber: z.string().optional(),
    panNumber: z.string().optional(),
    businessRegistrationNumber: z.string().optional(),
    rewardType: z.enum(["default", "flat", "percentage", "slab"]).optional(),
    defaultPoints: z.number().optional(),
    flatPoints: z.number().optional(),
    percentageValue: z.number().optional(),
    slabRules: z.array(slabRuleSchema).optional(),
    rewardName: z.string().optional(),
    rewardDescription: z.string().optional(),
    paymentRewardEnabled: z.boolean().optional(),
    dailyMaxPoints: z.number().optional(),
    upiIds: z.array(z.string()),
    qrCodeType: z.enum(["dynamic", "static", "static_hidden"]),
    subscriptionTier: z.enum(["free", "pro", "premium"]),
    establishedYear: z.string().nullable().optional(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
});

export const phoneLoginSchema = z.object({
    firebaseIdToken: z.string().min(1, "firebaseIdToken required"),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, "refreshToken required"),
});

export const changePasswordSchema = z.object({
    newPassword: z.string().min(6, "newPassword must be at least 6 characters"),
});

export const requestPasswordResetSchema = z.object({
    email: z.string().email("Valid email required"),
});

export const confirmPasswordResetSchema = z.object({
    oobCode: z.string().min(1, "oobCode required"),
    newPassword: z.string().min(6, "newPassword must be at least 6 characters"),
});

export const reauthenticateSchema = z.object({
    currentPassword: z.string().min(1, "currentPassword required"),
});

export const validateCitySchema = z.object({
    city: z.string().min(1, "city required"),
});

export const sendOTPSchema = z.object({
    phone: z
        .string()
        .regex(/^\d{10}$/, "phone must be a 10-digit Indian mobile number (no country code)"),
    purpose: z.enum(["register", "login"]).optional(),
});

export const verifyOTPSchema = z.object({
    phone: z
        .string()
        .regex(/^\d{10}$/, "phone must be a 10-digit Indian mobile number (no country code)"),
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
});
