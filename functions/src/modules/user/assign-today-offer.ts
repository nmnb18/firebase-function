import { Request, Response, NextFunction } from "express";
import { db, adminRef } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const assignTodayOfferHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid)
                return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);

            const { seller_id } = req.body;
            if (!seller_id) return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "seller_id required", HttpStatus.BAD_REQUEST);

            const sellerSnap = await db
                .collection("seller_profiles")
                .doc(seller_id)
                .get();

            if (!sellerSnap.exists) {
                return sendError(res, ErrorCodes.NOT_FOUND, "Seller not found", HttpStatus.NOT_FOUND);
            }

            const seller = sellerSnap.data();

            const userSnap = await db
                .collection("customer_profiles")
                .doc(currentUser.uid)
                .get();

            if (!userSnap.exists) {
                return sendError(res, ErrorCodes.NOT_FOUND, "User not found", HttpStatus.NOT_FOUND);
            }

            const user = sellerSnap.data();

            const today = new Date().toISOString().slice(0, 10);
            const claimId = `${currentUser.uid}_${seller_id}_${today}`;

            // Already selected → return existing
            const claimSnap = await db.collection("today_offer_claims").doc(claimId).get();
            if (claimSnap.exists) {
                return sendSuccess(res, { alreadyAssigned: true, offer: claimSnap.data() }, HttpStatus.OK);
            }

            // Fetch seller offers
            const doc = await db.collection("seller_daily_offers")
                .doc(`${seller_id}_${today}`)
                .get();

            if (!doc.exists) {
                return sendError(res, ErrorCodes.NOT_FOUND, "No offers configured for today", HttpStatus.NOT_FOUND);
            }

            const offers = doc.data()?.offers || [];
            if (!offers.length) return sendError(res, ErrorCodes.NOT_FOUND, "No offers available", HttpStatus.BAD_REQUEST);

            // Random secure selection
            const randomIndex = Math.floor(Math.random() * offers.length);
            const selected = offers[randomIndex];
            await db.collection("today_offer_claims").doc(claimId).set({
                offer_id: selected.id,
                title: selected.title,
                min_spend: selected.min_spend,
                terms: selected.terms,
                seller_id,
                user_id: currentUser.uid,
                date: today,
                status: 'ASSIGNED',
                redeemed: false,
                created_at: adminRef.firestore.FieldValue.serverTimestamp(),
                shop_name: seller?.business?.shop_name || "Unknown Store",
                seller_logo: seller?.media?.logo_url || "",
                customer_name: user?.account.name,
                customer_contact: user?.account.phone
            });

            return sendSuccess(res, { offer: selected }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
