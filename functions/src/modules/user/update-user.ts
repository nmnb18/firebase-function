import * as functions from "firebase-functions";
import { db, adminRef } from "../../config/firebase";
import cors from "cors";
import { authenticateUser } from "../../middleware/auth";

const corsHandler = cors({ origin: true });


export const updateUserProfile = functions.https.onRequest(
    { region: 'asia-south1' }, async (req, res) => {
        corsHandler(req, res, async () => {
            try {
                if (req.method !== "PATCH") {
                    return res.status(405).json({ error: "PATCH method required" });
                }

                // Authenticate
                const currentUser = await authenticateUser(req.headers.authorization);
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
                    "location",
                ];

                if (!validSections.includes(section)) {
                    return res.status(400).json({
                        error: `Invalid section. Allowed: ${validSections.join(", ")}`,
                    });
                }

                const userId = currentUser.uid;
                const userRef = db.collection("customer_profiles").doc(userId);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    return res.status(404).json({ error: "Customer profile not found" });
                }

                const customerProfile = userDoc.data() ?? {};

                // Prepare update payload
                let updatePayload: any = {
                    updated_at: adminRef.firestore.FieldValue.serverTimestamp(),
                };

                updatePayload[section] = {
                    ...customerProfile[section],
                    ...data
                };

                // Update DB
                await userRef.update(updatePayload);

                // Get updated document
                const updatedDoc = await userRef.get();
                const updatedData = updatedDoc.data();

                return res.status(200).json({
                    success: true,
                    message: `${section} section updated successfully`,
                    updated: updatePayload,
                    customer_profile: updatedData
                });
            } catch (error: any) {
                console.error("Update customer profile error:", error);

                if (error.code === "auth/argument-error") {
                    return res.status(401).json({ error: "Invalid or expired token" });
                }

                return res.status(500).json({
                    error: "Failed to update profile. Please try again.",
                });
            }
        });
    });