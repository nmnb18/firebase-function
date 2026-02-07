/**
 * Optimized Firebase Callable Function Wrapper
 * Replaces onRequest with onCall for better performance
 */

import * as functions from "firebase-functions";
import { errorResponse, successResponse, ErrorResponse, SuccessResponse } from "./performance";

interface AuthContext {
    uid: string;
    email?: string;
}

export interface CallableRequest<T = any> {
    data: T;
    auth?: AuthContext;
}

export interface CallableResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * Wrapper for callable functions with built-in error handling
 */
export function createCallableFunction<InputType = any, OutputType = any>(
    handler: (
        data: InputType,
        auth: AuthContext | undefined,
        context: any
    ) => Promise<OutputType>,
    options?: { region?: string; requireAuth?: boolean; secrets?: string[] }
) {
    const fnOptions: any = { region: options?.region || "asia-south1" };
    if (options?.secrets && options.secrets.length > 0) {
        fnOptions.secrets = options.secrets;
    }

    return functions.https.onCall(fnOptions, async (request: any, context: any) => {
        try {
            // Check authentication if required
            if (options?.requireAuth !== false && !context.auth?.uid) {
                throw new Error("Unauthorized");
            }

            const auth = context.auth ? { uid: context.auth.uid, email: context.auth.email } : undefined;
            const result = await handler(request?.data as InputType, auth, context);
            return successResponse(result);
        } catch (error: any) {
            console.error("Callable function error:", error);
            throw new functions.https.HttpsError(
                error.code || "internal",
                error.message || "Internal server error",
                { details: error.details }
            );
        }
    });
}

/**
 * Batch operation wrapper with transaction support
 */
export async function executeInTransaction<T>(
    db: any,
    handler: (tx: any) => Promise<T>
): Promise<T> {
    return db.runTransaction(handler);
}

/**
 * Validation helpers
 */
export const validators = {
    isEmail: (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    isUUID: (uuid: string): boolean =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid),
    isPositiveNumber: (num: any): boolean => typeof num === "number" && num > 0,
    isNonEmptyString: (str: any): boolean => typeof str === "string" && str.trim().length > 0,
};

/**
 * Common validation errors
 */
export const validationErrors = {
    missingFields: (fields: string[]) => `Missing required fields: ${fields.join(", ")}`,
    invalidEmail: "Invalid email format",
    invalidUUID: "Invalid UUID format",
    invalidNumber: (field: string) => `${field} must be a positive number`,
    unauthorized: "Unauthorized access",
    notFound: (resource: string) => `${resource} not found`,
    alreadyExists: (resource: string) => `${resource} already exists`,
};
