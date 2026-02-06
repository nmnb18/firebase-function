import { createCallableFunction } from "../utils/callable";

interface TestConnectionOutput {
    success: boolean;
    message: string;
    timestamp: string;
    environment: string;
    endpoint: string;
}

export const testConnection = createCallableFunction<void, TestConnectionOutput>(
    async (data, auth, context) => {
        return {
            success: true,
            message: "Firebase Functions callable is working!",
            timestamp: new Date().toISOString(),
            environment: "production",
            endpoint: "testConnection"
        };
    },
    {
        region: "asia-south1",
        requireAuth: false
    }
);