import * as functions from "firebase-functions";
import { auth, db, adminRef } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });

export const updateSellerProfile = functions.https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "PATCH") {
                return res.status(405).json({ error: "PATCH method required" });
            }

            // authenticate
            const currentUser = await authenticateUser(req.headers.authorization);
            // authenticateUser in your middleware likely ends response on failure; 
            // assume it sets req.currentUser (adjust if your function works differently)
            //const currentUser = (req as any).currentUser;
            if (!currentUser || !currentUser.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const { section, data } = req.body;

            if (!section || !data) {
                return res.status(400).json({
                    error: "Missing required fields: section, data",
                });
            }

            // Allowed updatable sections
            const validSections = [
                "account",
                "business",
                "location",
                "verification",
                "rewards",
            ];

            if (!validSections.includes(section)) {
                return res.status(400).json({
                    error: `Invalid section. Allowed: ${validSections.join(", ")}`,
                });
            }

            const sellerRef = db.collection("seller_profiles").doc(currentUser.uid);
            const sellerDoc = await sellerRef.get();

            if (!sellerDoc.exists) {
                return res.status(404).json({ error: "Seller profile not found" });
            }

            const sellerProfile = sellerDoc.data() ?? {};

            // Prepare nested update
            const updatedSection = {
                ...sellerProfile[section],
                ...data,
            };

            const updatePayload: any = {
                [section]: updatedSection,
                updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
            };

            // Business rule: prevent modifying verification status directly
            if (section === "verification") {
                delete updatePayload.verification?.status;
                delete updatePayload.verification?.is_verified;
            }

            // Update DB
            await sellerRef.update(updatePayload);

            return res.status(200).json({
                success: true,
                message: `${section} section updated successfully`,
                updated: updatePayload,
            });
        } catch (error: any) {
            console.error("Update seller profile error:", error);

            if (error.code === "auth/argument-error") {
                return res.status(401).json({ error: "Invalid or expired token" });
            }

            return res.status(500).json({
                error: "Failed to update profile. Please try again.",
            });
        }
    });
});
