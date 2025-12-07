import * as functions from "firebase-functions";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import cors from "cors";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

const corsHandler = cors({ origin: true });
const upload = multer({ storage: multer.memoryStorage() });

// ✅ FIREBASE STORAGE
const bucket = adminRef.storage().bucket();

export const updateSellerMedia = functions.https.onRequest((req: any, res) => {
    corsHandler(req, res, async () => {

        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const uploadMiddleware = upload.fields([
            { name: "logo", maxCount: 1 },
            { name: "banner", maxCount: 1 },
        ]);

        uploadMiddleware(req, res, async (err: any) => {
            if (err) {
                return res.status(400).json({ error: err.message });
            }

            try {
                // ✅ AUTH
                const currentUser = await authenticateUser(req.headers.authorization);
                const sellerId = currentUser.uid;

                const files: any = req.files;

                if (!files?.logo && !files?.banner) {
                    return res.status(400).json({ error: "No media files provided" });
                }

                const updates: any = {};
                const uploadPromises: Promise<void>[] = [];

                // ✅ UPLOAD LOGO
                if (files?.logo?.[0]) {
                    const logoFile = files.logo[0];
                    const logoExt = logoFile.mimetype.split("/")[1];
                    const logoPath = `seller_media/${sellerId}/logo_${uuidv4()}.${logoExt}`;

                    const logoUpload = bucket.file(logoPath);
                    const logoStream = logoUpload.createWriteStream({
                        metadata: {
                            contentType: logoFile.mimetype,
                        },
                    });

                    uploadPromises.push(new Promise((resolve, reject) => {
                        logoStream.on("finish", async () => {
                            const [url] = await logoUpload.getSignedUrl({
                                action: "read",
                                expires: "03-01-2500", // long-lived public URL
                            });

                            updates["media.logo_url"] = url;
                            resolve();
                        });

                        logoStream.on("error", reject);
                        logoStream.end(logoFile.buffer);
                    }));
                }

                // ✅ UPLOAD BANNER
                if (files?.banner?.[0]) {
                    const bannerFile = files.banner[0];
                    const bannerExt = bannerFile.mimetype.split("/")[1];
                    const bannerPath = `seller_media/${sellerId}/banner_${uuidv4()}.${bannerExt}`;

                    const bannerUpload = bucket.file(bannerPath);
                    const bannerStream = bannerUpload.createWriteStream({
                        metadata: {
                            contentType: bannerFile.mimetype,
                        },
                    });

                    uploadPromises.push(new Promise((resolve, reject) => {
                        bannerStream.on("finish", async () => {
                            const [url] = await bannerUpload.getSignedUrl({
                                action: "read",
                                expires: "03-01-2500",
                            });

                            updates["media.banner_url"] = url;
                            resolve();
                        });

                        bannerStream.on("error", reject);
                        bannerStream.end(bannerFile.buffer);
                    }));
                }

                // ✅ WAIT FOR BOTH UPLOADS
                await Promise.all(uploadPromises);

                // ✅ UPDATE FIRESTORE
                await db.collection("seller_profiles")
                    .doc(sellerId)
                    .update(updates);

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
});
