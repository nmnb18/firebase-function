import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import dayjs from "dayjs";
import { Timestamp } from "firebase-admin/firestore";

const corsHandler = cors({ origin: true });

export const countMonthlyQRCodes = functions.https.onRequest(
    { region: 'asia-south1' }, (req, res) => {
        corsHandler(req, res, async () => {
            try {
                // Check method
                if (req.method !== "GET") {
                    return res.status(405).json({ error: "Only GET method allowed" });
                }

                //  Authenticate request
                const currentUser = await authenticateUser(req.headers.authorization);
                if (!currentUser || !currentUser.uid) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                //  Compute start and end of current month
                const startOfMonth = Timestamp.fromDate(dayjs().startOf("month").toDate());
                const endOfMonth = Timestamp.fromDate(dayjs().endOf("month").toDate());

                // Fetch QR codes created this month
                const qrSnapshot = await db
                    .collection("qr_codes")
                    .where("seller_id", "==", currentUser.uid)
                    .where("created_at", ">=", startOfMonth)
                    .where("created_at", "<=", endOfMonth)
                    .get();

                return res.status(200).json({
                    success: true,
                    count: qrSnapshot.size,
                });
            } catch (error: any) {
                console.error("countMonthlyQRCodes error:", error);
                return res.status(500).json({
                    success: false,
                    error: error.message || "Internal Server Error",
                });
            }
        });
    });
