import { db } from "../../config/firebase";
import { createCallableFunction } from "../../utils/callable";
import dayjs from "dayjs";
import { Timestamp } from "firebase-admin/firestore";

interface CountMonthlyQRCodesOutput {
    success: boolean;
    count: number;
}

export const countMonthlyQRCodes = createCallableFunction<void, CountMonthlyQRCodesOutput>(
    async (data, auth, context) => {
        const startOfMonth = Timestamp.fromDate(dayjs().startOf("month").toDate());
        const endOfMonth = Timestamp.fromDate(dayjs().endOf("month").toDate());

        const qrSnapshot = await db
            .collection("qr_codes")
            .where("seller_id", "==", auth!.uid)
            .where("created_at", ">=", startOfMonth)
            .where("created_at", "<=", endOfMonth)
            .get();

        return {
            success: true,
            count: qrSnapshot.size,
        };
    },
    {
        region: "asia-south1",
        requireAuth: true,
    }
);
