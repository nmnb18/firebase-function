import { createCallableFunction } from "../../utils/callable";
import { adminRef, db } from "../../config/firebase";
import { v4 as uuidv4 } from "uuid";

const bucket = adminRef.storage().bucket();

const uploadBase64 = async (base64: string, path: string): Promise<string> => {
    const file = bucket.file(path);
    await file.save(Buffer.from(base64, "base64"), {
        contentType: "image/jpeg",
        public: false,
    });
    await file.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
    return url;
};

interface UpdateMediaRequest {
    logo?: string;
    banner?: string;
}

export const updateSellerMedia = createCallableFunction<UpdateMediaRequest, any>(
    async (data, auth) => {
        const { logo, banner } = data;

        if (!logo && !banner) {
            throw new Error("No media provided");
        }

        const sellerId = auth!.uid;
        const updates: any = {};

        // Upload logo and banner in parallel if both provided
        const uploadTasks = [];

        if (logo) {
            const logoPath = `seller_media/${sellerId}/logo_${uuidv4()}.jpg`;
            uploadTasks.push(
                uploadBase64(logo, logoPath).then((url) => {
                    updates["media.logo_url"] = url;
                })
            );
        }

        if (banner) {
            const bannerPath = `seller_media/${sellerId}/banner_${uuidv4()}.jpg`;
            uploadTasks.push(
                uploadBase64(banner, bannerPath).then((url) => {
                    updates["media.banner_url"] = url;
                })
            );
        }

        // Execute uploads in parallel
        await Promise.all(uploadTasks);

        // Update Firestore
        await db.collection("seller_profiles").doc(sellerId).update(updates);

        return {
            success: true,
            media: updates,
        };
    },
    { region: "asia-south1", requireAuth: true }
);
