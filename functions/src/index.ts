import * as functions from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { app } from "./app";

const API_KEY = defineSecret("API_KEY");
const RAZORPAY_ENV = defineSecret("RAZORPAY_ENV");
const RAZORPAY_KEY_ID_TEST = defineSecret("RAZORPAY_KEY_ID_TEST");
const RAZORPAY_SECRET_TEST = defineSecret("RAZORPAY_SECRET_TEST");

// Single consolidated API Cloud Run service — one container, zero cold-start overhead
export const api = functions.https.onRequest(
    {
        secrets: [API_KEY, RAZORPAY_ENV, RAZORPAY_KEY_ID_TEST, RAZORPAY_SECRET_TEST],
        region: "asia-south1",
        minInstances: 0,
        timeoutSeconds: 60,
        memory: "512MiB",
    },
    app
);

// Cron job stays as a separate Cloud Function (not HTTP)
export { expireUnredeemedOffers } from "./modules/cron/expire-unredeemed-offers";
export { warmupPing } from "./modules/cron/warmup-ping";