import * as functions from "firebase-functions";
import cors from "cors";

const corsHandler = cors({ origin: true });

export const testConnection = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            res.status(200).json({
                success: true,
                message: "Firebase Functions emulator is working!",
                timestamp: new Date().toISOString(),
                clientIP: req.ip,
                environment: "development",
                endpoint: "testConnection"
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});