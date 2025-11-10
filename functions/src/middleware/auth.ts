import { auth } from "../config/firebase";

export interface AuthenticatedUser {
    uid: string;
    email?: string;
    [key: string]: any;
}

export class AuthError extends Error {
    constructor(message: string, public statusCode: number = 401) {
        super(message);
        this.name = 'AuthError';
    }
}

/**
 * Common function to authenticate user from authorization header
 * @param authorizationHeader - The authorization header from the request
 * @returns Promise<AuthenticatedUser> - The authenticated user object
 * @throws AuthError - If authentication fails
 */
export const authenticateUser = async (authorizationHeader: string | undefined): Promise<AuthenticatedUser> => {
    // Check if authorization header exists and is in correct format
    if (!authorizationHeader) {
        throw new AuthError("Missing authorization header");
    }

    if (!authorizationHeader.startsWith("Bearer ")) {
        throw new AuthError("Invalid authorization format. Expected 'Bearer <token>'");
    }

    // Extract token
    const token = authorizationHeader.split("Bearer ")[1];
    if (!token) {
        throw new AuthError("Missing token in authorization header");
    }

    try {
        // Verify the token
        const decodedToken = await auth.verifyIdToken(token);
        return decodedToken;
    } catch (error: any) {
        console.error("Token verification failed:", error);

        // Handle specific Firebase auth errors
        if (error.code === 'auth/id-token-expired') {
            throw new AuthError("Token has expired", 401);
        } else if (error.code === 'auth/id-token-revoked') {
            throw new AuthError("Token has been revoked", 401);
        } else if (error.code === 'auth/argument-error') {
            throw new AuthError("Invalid token format", 401);
        } else {
            throw new AuthError("Invalid token", 401);
        }
    }
};

/**
 * Helper to check if user has a specific role
 * @param user - The authenticated user
 * @param requiredRole - The required role
 * @returns boolean - Whether user has the required role
 */
export const hasRole = async (user: AuthenticatedUser, requiredRole: string): Promise<boolean> => {
    // You can implement role checking logic here
    // For now, this is a placeholder - you might want to check Firestore for user roles
    return true; // Modify based on your role system
};

/**
 * Common error handler for authentication failures
 * @param error - The error object
 * @param res - The response object
 */
export const handleAuthError = (error: any, res: any) => {
    if (error instanceof AuthError) {
        return res.status(error.statusCode).json({ error: error.message });
    } else {
        console.error('Unexpected auth error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};