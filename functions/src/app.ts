import express from "express";
import cors from "cors";

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

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

// Warmup
app.get("/warmup", (_req, res) => res.status(200).json({ status: "warm" }));

// Auth
app.post("/loginUser", loginUserHandler);
app.post("/loginSeller", loginSellerHandler);
app.post("/registerUser", registerUserHandler);
app.post("/registerSeller", registerSellerHandler);
app.post("/phoneLogin", phoneLoginHandler);
app.post("/logout", logoutHandler);
app.post("/refreshToken", refreshTokenHandler);
app.post("/changePassword", changePasswordHandler);
app.post("/requestPasswordReset", requestPasswordResetHandler);
app.post("/confirmPasswordReset", confirmPasswordResetHandler);
app.post("/reauthenticate", reauthenticateHandler);
app.delete("/deleteUser", deleteUserHandler);
app.delete("/deleteSellerAccount", deleteSellerAccountHandler);
app.get("/verifyEmail", verifyEmailHandler);
app.post("/validateCity", validateCityHandler);

// User
app.get("/getUserDetails", getUserDetailsHandler);
app.patch("/updateUserProfile", updateUserProfileHandler);
app.get("/getUserPerks", getUserPerksHandler);
app.post("/assignTodayOffer", assignTodayOfferHandler);
app.get("/getTodayOfferStatus", getTodayOfferStatusHandler);
app.post("/redeemTodayOffer", redeemTodayOfferHandler);

// Seller
app.get("/getSellerDetails", getSellerDetailsHandler);
app.patch("/updateSellerProfile", updateSellerProfileHandler);
app.post("/updateSellerMedia", updateSellerMediaHandler);
app.get("/getNearbySellers", getNearbySellersHandler);
app.get("/getSellerOffers", getSellerOffersHandler);
app.post("/saveSellerOffer", saveSellerOfferHandler);
app.delete("/deleteSellerOffer", deleteSellerOfferHandler);
app.get("/getSellerOfferById", getSellerOfferByIdHandler);
app.get("/getSubscriptionHistory", getSubscriptionHistoryHandler);
app.get("/getSellerRedeemedPerks", getSellerRedeemedPerksHandler);
app.get("/sellerAdvancedAnalytics", sellerAdvancedAnalyticsHandler);

// Points
app.get("/getPointsBalance", getPointsBalanceHandler);
app.get("/getBalanceBySeller", getBalanceBySellerHandler);
app.get("/getTransactions", getTransactionsHandler);

// Redemption
app.post("/createRedemption", createRedemptionHandler);
app.get("/getUserRedemptions", getUserRedemptionsHandler);
app.get("/getSellerRedemptions", getSellerRedemptionsHandler);
app.post("/processRedemption", processRedemptionHandler);
app.post("/cancelRedemption", cancelRedemptionHandler);
app.get("/getRedemptionQR", getRedemptionQRHandler);
app.get("/getRedemptionStatus", getRedemptionStatusHandler);
app.post("/markRedemptionAsExpired", markRedemptionAsExpiredHandler);
app.get("/redemptionAnalytics", redemptionAnalyticsHandler);
app.post("/verifyRedeemCode", verifyRedeemCodeHandler);

// QR Code
app.get("/generateUserQR", generateUserQRHandler);
app.post("/scanUserQRCode", scanUserQRCodeHandler);

// Payments
app.post("/applyCoupon", applyCouponHandler);
app.post("/createOrder", createOrderHandler);
app.post("/verifyPayment", verifyPaymentHandler);
app.post("/verifyIAPPurchase", verifyIAPPurchaseHandler);

// Push Notifications
app.post("/registerPushToken", registerPushTokenHandler);
app.post("/unregisterPushToken", unregisterPushTokenHandler);
app.get("/getNotifications", getNotificationsHandler);
app.get("/getUnreadNotificationCount", getUnreadNotificationCountHandler);
app.post("/markNotificationsRead", markNotificationsReadHandler);

// Dashboard
app.get("/sellerStats", sellerStatsHandler);

export { app };
