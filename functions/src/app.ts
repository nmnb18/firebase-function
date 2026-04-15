import express from "express";
import cors from "cors";

// Middleware
import { correlationMiddleware } from "./middleware/correlation";
import { sanitizePIIMiddleware } from "./middleware/sanitize-pii";
import { errorHandlerMiddleware } from "./middleware/error-handler";
import { validateBody, validateQuery } from "./middleware/validate";
import { loginRateLimit, upiOrderRateLimit, qrScanRateLimit, clientLogRateLimit, otpRateLimit, vpaLookupRateLimit } from "./middleware/rate-limit";

// Validation schemas
import {
    loginSchema,
    registerUserSchema,
    registerSellerSchema,
    phoneLoginSchema,
    refreshTokenSchema,
    changePasswordSchema,
    requestPasswordResetSchema,
    confirmPasswordResetSchema,
    reauthenticateSchema,
    validateCitySchema,
    sendOTPSchema,
    verifyOTPSchema,
} from "./validation/auth.schemas";
import {
    updateUserProfileSchema,
    assignTodayOfferSchema,
    redeemTodayOfferSchema,
} from "./validation/user.schemas";
import {
    updateSellerProfileSchema,
    updateSellerMediaSchema,
    saveSellerOfferSchema,
} from "./validation/seller.schemas";
import {
    createRedemptionSchema,
    processRedemptionSchema,
    cancelRedemptionSchema,
    markRedemptionAsExpiredSchema,
    verifyRedeemCodeSchema,
} from "./validation/redemption.schemas";
import {
    createOrderSchema,
    verifyPaymentSchema,
    applyCouponSchema,
    verifyIAPPurchaseSchema,
} from "./validation/payments.schemas";
import {
    createUPIPaymentOrderSchema,
    confirmUPIPaymentSchema,
    scanUserQRCodeSchema,
} from "./validation/upi.schemas";
import {
    registerPushTokenSchema,
    unregisterPushTokenSchema,
    markNotificationsReadSchema,
} from "./validation/push.schemas";
import { clientLogBatchSchema } from "./validation/client-log.schemas";

// Logging
import { clientLogHandler } from "./modules/logging/client-log";

// Dashboard
import { errorDashboardHandler } from "./modules/dashboard/error-dashboard";

// Auth
import { changePasswordHandler } from "./modules/auth/changePassword";
import { confirmPasswordResetHandler } from "./modules/auth/confirmPasswordReset";
import { deleteSellerAccountHandler } from "./modules/auth/deleteSeller";
import { deleteUserHandler } from "./modules/auth/deleteUser";
import { loginSellerHandler } from "./modules/auth/loginSeller";
import { loginUserHandler } from "./modules/auth/loginUser";
import { logoutHandler } from "./modules/auth/logout";
import { phoneLoginHandler } from "./modules/auth/phoneLogin";
import { reauthenticateHandler } from "./modules/auth/reauthenticate";
import { sendOTPHandler } from "./modules/auth/sendOTP";
import { verifyOTPHandler } from "./modules/auth/verifyOTP";
import { getConfigHandler } from "./modules/auth/getConfig";
import { refreshTokenHandler } from "./modules/auth/refreshToken";
import { registerSellerHandler } from "./modules/auth/registerSeller";
import { registerUserHandler } from "./modules/auth/registerUser";
import { requestPasswordResetHandler } from "./modules/auth/requestPasswordReset";
import { validateCityHandler } from "./modules/auth/validateCity";
import { verifyEmailHandler } from "./modules/auth/verifyEmail";

// Dashboard
import { sellerStatsHandler } from "./modules/dashboard/seller-stats";

// Payments
import { applyCouponHandler } from "./modules/payments/applyCoupon";
import { createOrderHandler } from "./modules/payments/createOrder";
import { verifyIAPPurchaseHandler } from "./modules/payments/verifyIAPPurchase";
import { verifyPaymentHandler } from "./modules/payments/verifyPayment";

// Points
import { getBalanceBySellerHandler } from "./modules/points/get-balance-by-seller";
import { getPointsBalanceHandler } from "./modules/points/get-balance";
import { getTransactionsHandler } from "./modules/points/get-transactions";

// Push Notifications
import { getNotificationsHandler } from "./modules/push-notification/getNotifications";
import { getUnreadNotificationCountHandler } from "./modules/push-notification/getUnreadNotificationCount";
import { markNotificationsReadHandler } from "./modules/push-notification/markNotificationsRead";
import { registerPushTokenHandler } from "./modules/push-notification/registerPushToken";
import { unregisterPushTokenHandler } from "./modules/push-notification/unregisterPushToken";

// QR Code
import { generateUserQRHandler } from "./modules/qr-code/generate-user-qr";
import { scanUserQRCodeHandler } from "./modules/qr-code/scan-user-qr-code";

// Redemption
import { cancelRedemptionHandler } from "./modules/redemption/cancel-redemption";
import { createRedemptionHandler } from "./modules/redemption/create-redemption";
import { getRedemptionQRHandler } from "./modules/redemption/get-redemption-qr";
import { getSellerRedemptionsHandler } from "./modules/redemption/get-seller-redemption";
import { getUserRedemptionsHandler } from "./modules/redemption/get-user-redemption";
import { markRedemptionAsExpiredHandler } from "./modules/redemption/markRedemtionAsExpired";
import { processRedemptionHandler } from "./modules/redemption/process-redemption";
import { redemptionAnalyticsHandler } from "./modules/redemption/redemption-analytics";
import { getRedemptionStatusHandler } from "./modules/redemption/redemption-status";
import { verifyRedeemCodeHandler } from "./modules/redemption/verify-redeem-code";

// Seller
import { sellerAdvancedAnalyticsHandler } from "./modules/seller/advance-analytics";
import { deleteSellerOfferHandler } from "./modules/seller/delete-seller-offer";
import { getNearbySellersHandler } from "./modules/seller/get-near-by-seller";
import { getSellerDetailsHandler } from "./modules/seller/get-seller-details";
import { getSellerOfferByIdHandler } from "./modules/seller/get-seller-offer-by-id";
import { getSellerOffersHandler } from "./modules/seller/get-seller-offers";
import { getSellerRedeemedPerksHandler } from "./modules/seller/get-seller-perks";
import { getSubscriptionHistoryHandler } from "./modules/seller/get-subscription-history";
import { saveSellerOfferHandler } from "./modules/seller/save-seller-offer";
import { updateSellerMediaHandler } from "./modules/seller/update-seller-media";
import { updateSellerProfileHandler } from "./modules/seller/update-seller";

// User
import { assignTodayOfferHandler } from "./modules/user/assign-today-offer";
import { getTodayOfferStatusHandler } from "./modules/user/get-today-offer-status";
import { getUserDetailsHandler } from "./modules/user/get-user-details";
import { getUserPerksHandler } from "./modules/user/get-user-perks";
import { redeemTodayOfferHandler } from "./modules/user/redeem-today-offer";
import { updateUserProfileHandler } from "./modules/user/update-user";

// UPI
import { getSellerByVPAHandler } from "./modules/upi/get-seller-by-vpa";
import { createUPIPaymentOrderHandler } from "./modules/upi/create-upi-payment-order";
import { confirmUPIPaymentAndAwardPointsHandler } from "./modules/upi/confirm-upi-payment-and-award-points";
import { razorpayWebhookHandler } from "./modules/upi/razorpay-webhook";

const app = express();

// CORS: allow requests with no Origin (mobile apps) and whitelisted web origins.
// Set CORS_ALLOWED_ORIGINS env var to a comma-separated list of allowed web origins.
// e.g. CORS_ALLOWED_ORIGINS=https://dashboard.grabbitt.in,https://admin.grabbitt.in
const CORS_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : [];

app.use(cors({
    origin: (origin, callback) => {
        // No Origin header = mobile app / server-to-server call — always allow
        if (!origin) return callback(null, true);
        if (CORS_ORIGINS.includes(origin)) return callback(null, true);
        callback(new Error(`CORS policy: origin '${origin}' is not allowed`));
    },
    credentials: true,
}));
app.use(express.json({
    limit: "10mb",
    // Capture the raw body buffer so the Razorpay webhook handler can
    // verify the X-Razorpay-Signature without re-serialising the payload.
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

// ── Observability middleware (runs before every route) ─────────────────────
app.use(correlationMiddleware);
app.use(sanitizePIIMiddleware);

const router = express.Router();

// Warmup
router.get("/warmup", (_req, res) => res.status(200).json({ status: "warm" }));

// Auth
router.post("/loginUser", loginRateLimit, validateBody(loginSchema), loginUserHandler);
router.post("/loginSeller", loginRateLimit, validateBody(loginSchema), loginSellerHandler);
router.post("/registerUser", validateBody(registerUserSchema), registerUserHandler);
router.post("/registerSeller", validateBody(registerSellerSchema), registerSellerHandler);
router.post("/phoneLogin", validateBody(phoneLoginSchema), phoneLoginHandler);
router.post("/logout", logoutHandler);
router.post("/refreshToken", validateBody(refreshTokenSchema), refreshTokenHandler);
router.post("/changePassword", validateBody(changePasswordSchema), changePasswordHandler);
router.post("/requestPasswordReset", validateBody(requestPasswordResetSchema), requestPasswordResetHandler);
router.post("/confirmPasswordReset", validateBody(confirmPasswordResetSchema), confirmPasswordResetHandler);
router.post("/reauthenticate", validateBody(reauthenticateSchema), reauthenticateHandler);
router.delete("/deleteUser", deleteUserHandler);
router.delete("/deleteSellerAccount", deleteSellerAccountHandler);
router.get("/verifyEmail", verifyEmailHandler);
router.post("/validateCity", validateBody(validateCitySchema), validateCityHandler);
// MSG91 OTP endpoints (used when app_config/mobile.otp_provider = 'msg91')
router.post("/sendOTP", otpRateLimit, validateBody(sendOTPSchema), sendOTPHandler);
router.post("/verifyOTP", otpRateLimit, validateBody(verifyOTPSchema), verifyOTPHandler);
// Runtime app config (public)
router.get("/getConfig", getConfigHandler);

// User
router.get("/getUserDetails", getUserDetailsHandler);
router.patch("/updateUserProfile", validateBody(updateUserProfileSchema), updateUserProfileHandler);
router.get("/getUserPerks", getUserPerksHandler);
router.post("/assignTodayOffer", validateBody(assignTodayOfferSchema), assignTodayOfferHandler);
router.get("/getTodayOfferStatus", getTodayOfferStatusHandler);
router.post("/redeemTodayOffer", validateBody(redeemTodayOfferSchema), redeemTodayOfferHandler);

// Seller
router.get("/getSellerDetails", getSellerDetailsHandler);
router.patch("/updateSellerProfile", validateBody(updateSellerProfileSchema), updateSellerProfileHandler);
router.post("/updateSellerMedia", validateBody(updateSellerMediaSchema), updateSellerMediaHandler);
router.get("/getNearbySellers", getNearbySellersHandler);
router.get("/getSellerOffers", getSellerOffersHandler);
router.post("/saveSellerOffer", validateBody(saveSellerOfferSchema), saveSellerOfferHandler);
router.delete("/deleteSellerOffer", deleteSellerOfferHandler);
router.get("/getSellerOfferById", getSellerOfferByIdHandler);
router.get("/getSubscriptionHistory", getSubscriptionHistoryHandler);
router.get("/getSellerRedeemedPerks", getSellerRedeemedPerksHandler);
router.get("/sellerAdvancedAnalytics", sellerAdvancedAnalyticsHandler);

// Points
router.get("/getPointsBalance", getPointsBalanceHandler);
router.get("/getBalanceBySeller", getBalanceBySellerHandler);
router.get("/getTransactions", getTransactionsHandler);

// Redemption
router.post("/createRedemption", validateBody(createRedemptionSchema), createRedemptionHandler);
router.get("/getUserRedemptions", getUserRedemptionsHandler);
router.get("/getSellerRedemptions", getSellerRedemptionsHandler);
router.post("/processRedemption", validateBody(processRedemptionSchema), processRedemptionHandler);
router.post("/cancelRedemption", validateBody(cancelRedemptionSchema), cancelRedemptionHandler);
router.get("/getRedemptionQR", getRedemptionQRHandler);
router.get("/getRedemptionStatus", getRedemptionStatusHandler);
router.post("/markRedemptionAsExpired", validateBody(markRedemptionAsExpiredSchema), markRedemptionAsExpiredHandler);
router.get("/redemptionAnalytics", redemptionAnalyticsHandler);
router.post("/verifyRedeemCode", validateBody(verifyRedeemCodeSchema), verifyRedeemCodeHandler);

// QR Code
router.get("/generateUserQR", generateUserQRHandler);
router.post("/scanUserQRCode", qrScanRateLimit, validateBody(scanUserQRCodeSchema), scanUserQRCodeHandler);

// Payments
router.post("/applyCoupon", validateBody(applyCouponSchema), applyCouponHandler);
router.post("/createOrder", validateBody(createOrderSchema), createOrderHandler);
router.post("/verifyPayment", validateBody(verifyPaymentSchema), verifyPaymentHandler);
router.post("/verifyIAPPurchase", validateBody(verifyIAPPurchaseSchema), verifyIAPPurchaseHandler);

// UPI
router.get("/getSellerByVPA", vpaLookupRateLimit, getSellerByVPAHandler);
router.post("/createUPIPaymentOrder", upiOrderRateLimit, validateBody(createUPIPaymentOrderSchema), createUPIPaymentOrderHandler);
router.post("/confirmUPIPaymentAndAwardPoints", validateBody(confirmUPIPaymentSchema), confirmUPIPaymentAndAwardPointsHandler);
// razorpayWebhook: no body validation — Razorpay sends its own payload format; auth is HMAC-SHA256 signature
router.post("/razorpayWebhook", razorpayWebhookHandler);

// Push Notifications
router.post("/registerPushToken", validateBody(registerPushTokenSchema), registerPushTokenHandler);
router.post("/unregisterPushToken", validateBody(unregisterPushTokenSchema), unregisterPushTokenHandler);
router.get("/getNotifications", getNotificationsHandler);
router.get("/getUnreadNotificationCount", getUnreadNotificationCountHandler);
router.post("/markNotificationsRead", validateBody(markNotificationsReadSchema), markNotificationsReadHandler);

// Client Logging (FE crash / network error ingest)
router.post("/clientLog", clientLogRateLimit, validateBody(clientLogBatchSchema), clientLogHandler);

// Dashboard
router.get("/sellerStats", sellerStatsHandler);
router.get("/admin/errorDashboard", errorDashboardHandler);

app.use("/", router);

// ── Centralized error handler (MUST be last) ───────────────────────────────
app.use(errorHandlerMiddleware);

export { app };
