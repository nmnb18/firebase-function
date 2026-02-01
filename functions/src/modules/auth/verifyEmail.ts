import * as functions from "firebase-functions";
import cors from "cors";
import { adminRef, auth, db } from "../../config/firebase";

const corsHandler = cors({ origin: true });

export const verifyEmail = functions.https.onRequest(
    { region: 'asia-south1' }, async (req, res) => {
        corsHandler(req, res, async () => {
            const { token } = req.query;

            if (!token) {
                return res.status(400).json({ error: "Invalid token" });
            }

            const userSnap = await db
                .collection("users")
                .where("email_verification_token", "==", token)
                .limit(1)
                .get();

            if (userSnap.empty) {
                return res.status(400).json({ error: "Token invalid or expired" });
            }

            const userDoc = userSnap.docs[0];
            const userData = userDoc.data();

            if (userData.email_verification_expires.toDate() < new Date()) {
                return res.status(400).json({ error: "Link expired" });
            }

            await userDoc.ref.update({
                email_verified: true,
                email_verification_token: adminRef.firestore.FieldValue.delete(),
                email_verification_expires: adminRef.firestore.FieldValue.delete(),
                updatedAt: adminRef.firestore.FieldValue.serverTimestamp(),
            });

            // OPTIONAL: sync Firebase Auth
            await auth.updateUser(userDoc.id, {
                emailVerified: true,
            });

            return res.status(200).json({
                success: true,
                message: "Email verified successfully",
            });
        });
    }
);
