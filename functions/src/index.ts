import * as functions from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { app } from "./app";

const API_KEY = defineSecret("API_KEY");
const RAZORPAY_ENV = defineSecret("RAZORPAY_ENV");
const RAZORPAY_KEY_ID_TEST = defineSecret("RAZORPAY_KEY_ID_TEST");
const RAZORPAY_SECRET_TEST = defineSecret("RAZORPAY_SECRET_TEST");
const RAZORPAY_KEY_ID_LIVE = defineSecret("RAZORPAY_KEY_ID_LIVE");
const RAZORPAY_SECRET_LIVE = defineSecret("RAZORPAY_SECRET_LIVE");
const RAZORPAY_WEBHOOK_SECRET = defineSecret("RAZORPAY_WEBHOOK_SECRET");
const MSG91_AUTH_KEY = defineSecret("MSG91_AUTH_KEY");
const MSG91_TEMPLATE_ID = defineSecret("MSG91_TEMPLATE_ID");

// Single consolidated API Cloud Run service — one container, zero cold-start overhead
export const api = functions.https.onRequest(
    {
        secrets: [API_KEY, RAZORPAY_ENV, RAZORPAY_KEY_ID_TEST, RAZORPAY_SECRET_TEST, RAZORPAY_KEY_ID_LIVE, RAZORPAY_SECRET_LIVE, RAZORPAY_WEBHOOK_SECRET, MSG91_AUTH_KEY, MSG91_TEMPLATE_ID],
        region: "asia-south1",
        minInstances: 0,
        timeoutSeconds: 60,
        memory: "512MiB",
    },
    app
);

// Cron job stays as a separate Cloud Function (not HTTP)
export { expireUnredeemedOffers } from "./modules/cron/expire-unredeemed-offers";
export { expireOldData } from "./modules/cron/expire-old-data";
export { warmupPing } from "./modules/cron/warmup-ping";