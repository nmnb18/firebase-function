import { Request, Response, NextFunction } from "express";
import { adminRef, db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

const bucket = adminRef.storage().bucket();

export const updateSellerMediaHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

            const currentUser = await authenticateUser(req.headers.authorization);
            if (!currentUser?.uid) {
                return sendError(res, ErrorCodes.UNAUTHORIZED, "Unauthorized", HttpStatus.UNAUTHORIZED);
            }

            const sellerId = currentUser.uid;

            const { logo, banner } = req.body;

            if (!logo && !banner) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "No media provided", HttpStatus.BAD_REQUEST);
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

            return sendSuccess(res, { media: updates }, HttpStatus.OK);

    } catch (err) {
        next(err);
    }
};
