import express from "express";
import cors from "cors";

// Middleware
import { correlationMiddleware } from "./middleware/correlation";
import { sanitizePIIMiddleware } from "./middleware/sanitize-pii";
import { errorHandlerMiddleware } from "./middleware/error-handler";

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
app.use(cors({ origin: true }));
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
router.post("/loginUser", loginUserHandler);
router.post("/loginSeller", loginSellerHandler);
router.post("/registerUser", registerUserHandler);
router.post("/registerSeller", registerSellerHandler);
router.post("/phoneLogin", phoneLoginHandler);
router.post("/logout", logoutHandler);
router.post("/refreshToken", refreshTokenHandler);
router.post("/changePassword", changePasswordHandler);
router.post("/requestPasswordReset", requestPasswordResetHandler);
router.post("/confirmPasswordReset", confirmPasswordResetHandler);
router.post("/reauthenticate", reauthenticateHandler);
router.delete("/deleteUser", deleteUserHandler);
router.delete("/deleteSellerAccount", deleteSellerAccountHandler);
router.get("/verifyEmail", verifyEmailHandler);
router.post("/validateCity", validateCityHandler);

// User
router.get("/getUserDetails", getUserDetailsHandler);
router.patch("/updateUserProfile", updateUserProfileHandler);
router.get("/getUserPerks", getUserPerksHandler);
router.post("/assignTodayOffer", assignTodayOfferHandler);
router.get("/getTodayOfferStatus", getTodayOfferStatusHandler);
router.post("/redeemTodayOffer", redeemTodayOfferHandler);

// Seller
router.get("/getSellerDetails", getSellerDetailsHandler);
router.patch("/updateSellerProfile", updateSellerProfileHandler);
router.post("/updateSellerMedia", updateSellerMediaHandler);
router.get("/getNearbySellers", getNearbySellersHandler);
router.get("/getSellerOffers", getSellerOffersHandler);
router.post("/saveSellerOffer", saveSellerOfferHandler);
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
router.post("/createRedemption", createRedemptionHandler);
router.get("/getUserRedemptions", getUserRedemptionsHandler);
router.get("/getSellerRedemptions", getSellerRedemptionsHandler);
router.post("/processRedemption", processRedemptionHandler);
router.post("/cancelRedemption", cancelRedemptionHandler);
router.get("/getRedemptionQR", getRedemptionQRHandler);
router.get("/getRedemptionStatus", getRedemptionStatusHandler);
router.post("/markRedemptionAsExpired", markRedemptionAsExpiredHandler);
router.get("/redemptionAnalytics", redemptionAnalyticsHandler);
router.post("/verifyRedeemCode", verifyRedeemCodeHandler);

// QR Code
router.get("/generateUserQR", generateUserQRHandler);
router.post("/scanUserQRCode", scanUserQRCodeHandler);

// Payments
router.post("/applyCoupon", applyCouponHandler);
router.post("/createOrder", createOrderHandler);
router.post("/verifyPayment", verifyPaymentHandler);
router.post("/verifyIAPPurchase", verifyIAPPurchaseHandler);

// UPI
router.get("/getSellerByVPA", getSellerByVPAHandler);
router.post("/createUPIPaymentOrder", createUPIPaymentOrderHandler);
router.post("/confirmUPIPaymentAndAwardPoints", confirmUPIPaymentAndAwardPointsHandler);
router.post("/razorpayWebhook", razorpayWebhookHandler);

// Push Notifications
router.post("/registerPushToken", registerPushTokenHandler);
router.post("/unregisterPushToken", unregisterPushTokenHandler);
router.get("/getNotifications", getNotificationsHandler);
router.get("/getUnreadNotificationCount", getUnreadNotificationCountHandler);
router.post("/markNotificationsRead", markNotificationsReadHandler);

// Dashboard
router.get("/sellerStats", sellerStatsHandler);
router.get("/admin/errorDashboard", errorDashboardHandler);

app.use("/", router);

// ── Centralized error handler (MUST be last) ───────────────────────────────
app.use(errorHandlerMiddleware);

export { app };
