import { onSchedule } from "firebase-functions/v2/scheduler";
import axios from "axios";

export const warmupPing = onSchedule(
    {
        schedule: "every 5 minutes",
        timeZone: "Asia/Kolkata",
        region: "asia-south1",
    },
    async () => {
        try {
            await axios.get(
                "https://asia-south1-grabbitt-app.cloudfunctions.net/api/warmup",
                { timeout: 10000 }
            );
            console.log("Warmup ping successful");
        } catch (error) {
            console.error("Warmup ping failed:", error);
        }
    }
);
