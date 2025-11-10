import * as functions from "firebase-functions";
import { db } from "../../config/firebase";
import { calculateDistance } from "../../utils/qr-helper";
import { QRCodeScanRequest, ScanResponse } from "./types";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const scanQRCode = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            // Verify authentication
            const currentUser = await authenticateUser(req.headers.authorization);

            const { qr_id, hidden_code, user_lat, user_lng } = req.body as QRCodeScanRequest;
            if (!qr_id) {
                return res.status(400).json({ error: "QR ID is required" });
            }

            // Find QR code
            const qrRef = db.collection('qr_codes');
            const qrQuery = await qrRef
                .where('qr_id', '==', qr_id)
                .limit(1)
                .get();

            if (qrQuery.empty) {
                return res.status(404).json({ error: "Invalid QR code" });
            }

            const qrDoc = qrQuery.docs[0];
            const qrData = qrDoc.data();
            const qrType = qrData.qr_type || 'dynamic';
            const sellerId = qrData.seller_id;
            const pointsValue = qrData.points_value;

            // Get seller info
            const sellerDoc = await db.collection('seller_profiles').doc(sellerId).get();
            if (!sellerDoc.exists) {
                return res.status(404).json({ error: "Seller not found" });
            }
            const seller = sellerDoc.data();

            // VALIDATION LOGIC BASED ON QR TYPE
            if (qrType === 'dynamic') {
                // DYNAMIC QR: One-time use, check expiry
                if (qrData.used) {
                    return res.status(400).json({ error: "QR code already used" });
                }

                if (qrData.expires_at && qrData.expires_at.toDate() < new Date()) {
                    return res.status(400).json({ error: "QR code expired" });
                }

                // Mark as used
                await qrDoc.ref.update({
                    used: true,
                    used_by: currentUser.uid,
                    used_at: new Date()
                });

            } else if (qrType === 'static') {
                // STATIC QR: Once per day per user, optional location check
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                // Check if user already scanned today
                const dailyScansRef = db.collection('daily_scans');
                const dailyScanQuery = await dailyScansRef
                    .where('user_id', '==', currentUser.uid)
                    .where('seller_id', '==', sellerId)
                    .where('scan_date', '>=', today)
                    .limit(1)
                    .get();

                if (!dailyScanQuery.empty) {
                    return res.status(400).json({
                        error: "Already scanned today. Come back tomorrow!"
                    });
                }

                // Location validation
                if (seller?.location_lat && seller.location_lng) {
                    if (!user_lat || !user_lng) {
                        return res.status(400).json({
                            error: "Location required for this seller"
                        });
                    }

                    const distance = calculateDistance(
                        seller.location_lat,
                        seller.location_lng,
                        user_lat,
                        user_lng
                    );

                    const maxDistance = seller.location_radius_meters || 100;
                    if (distance > maxDistance) {
                        return res.status(400).json({
                            error: `Too far from seller location. Must be within ${maxDistance}m (you are ${Math.round(distance)}m away)`
                        });
                    }
                }

                // Record daily scan
                await dailyScansRef.add({
                    user_id: currentUser.uid,
                    seller_id: sellerId,
                    qr_id: qr_id,
                    scan_date: today,
                    scanned_at: new Date()
                });

            } else if (qrType === 'static_hidden') {
                // STATIC_HIDDEN: Check QR + hidden code combination, one-time use
                if (!hidden_code) {
                    return res.status(400).json({ error: "Hidden code required" });
                }

                if (qrData.used) {
                    return res.status(400).json({ error: "This code has already been used" });
                }

                if (hidden_code !== qrData.hidden_code) {
                    return res.status(400).json({ error: "Invalid hidden code" });
                }

                // Mark as used
                await qrDoc.ref.update({
                    used: true,
                    used_by: currentUser.uid,
                    used_at: new Date()
                });
            }

            // ALLOCATE POINTS
            const pointsRef = db.collection('points');
            const pointsQuery = await pointsRef
                .where('user_id', '==', currentUser.uid)
                .where('seller_id', '==', sellerId)
                .limit(1)
                .get();

            let newPoints = pointsValue;
            let pointsDocRef = null;

            if (!pointsQuery.empty) {
                pointsDocRef = pointsQuery.docs[0].ref;
                const currentPoints = pointsQuery.docs[0].data().points || 0;
                newPoints = currentPoints + pointsValue;

                await pointsDocRef.update({
                    points: newPoints,
                    last_updated: new Date()
                });
            } else {
                const newDoc = await pointsRef.add({
                    user_id: currentUser.uid,
                    seller_id: sellerId,
                    points: pointsValue,
                    last_updated: new Date()
                });
                pointsDocRef = newDoc;
            }

            // Create transaction record
            await db.collection('transactions').add({
                user_id: currentUser.uid,
                seller_id: sellerId,
                seller_name: seller?.shop_name,
                points: pointsValue,
                transaction_type: 'earn',
                qr_type: qrType,
                timestamp: new Date(),
                description: `Scanned ${qrType} QR - earned ${pointsValue} point(s)`
            });

            const response: ScanResponse = {
                message: 'Points earned successfully',
                qr_type: qrType,
                points_earned: pointsValue,
                total_points: newPoints,
                seller_name: seller?.shop_name
            };

            return res.status(200).json({ success: true, data: response });

        } catch (error: any) {
            console.error('Scan QR Error:', error);
            return res.status(500).json({ error: error.message });
        }
    });
});