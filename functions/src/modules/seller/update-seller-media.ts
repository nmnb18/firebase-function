import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const corsHandler = cors({ origin: true });

const bucket = adminRef.storage().bucket();

export const updateSellerMedia = functions.https.onRequest(async (req: any, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const sellerId = currentUser.uid;

            const { logo, banner } = req.body;

            if (!logo && !banner) {
                return res.status(400).json({ error: "No media provided" });
            }

            const updates: any = {};

            // Upload helper
            const uploadBase64 = async (base64: string, path: string) => {
                const file = bucket.file(path);
                await file.save(Buffer.from(base64, "base64"), {
                    contentType: "image/jpeg",
                    public: false,
                });
                await file.makePublic();
                const url = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
                return url;
            };

            // LOGO
            if (logo) {
                const logoPath = `seller_media/${sellerId}/logo_${uuidv4()}.jpg`;
                updates["media.logo_url"] = await uploadBase64(logo, logoPath);
            }

            // BANNER
            if (banner) {
                const bannerPath = `seller_media/${sellerId}/banner_${uuidv4()}.jpg`;
                updates["media.banner_url"] = await uploadBase64(banner, bannerPath);
            }

            await db.collection("seller_profiles").doc(sellerId).update(updates);

            return res.status(200).json({
                success: true,
                media: updates,
            });

        } catch (error: any) {
            console.error("updateSellerMedia Error:", error);
            return res.status(500).json({ error: error.message });
        }
    });
});
