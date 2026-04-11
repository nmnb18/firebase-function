import { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

type AuthResponse = {
    refresh_token: string;
    expires_in: string;
    user_id: string;
    id_token: string;
    error?: { message: string };
}

export const refreshTokenHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { refreshToken } = req.body;
            if (!refreshToken) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Missing refreshToken", HttpStatus.BAD_REQUEST);
            }

    try {
                const FIREBASE_API_KEY = process.env.API_KEY;
                // When the Auth emulator is running, FIREBASE_AUTH_EMULATOR_HOST is set
                // automatically. Route the REST token exchange to the emulator so that
                // emulator-issued refresh tokens are accepted.
                const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
                const baseUrl = emulatorHost
                    ? `http://${emulatorHost}/securetoken.googleapis.com/v1/token`
                    : `https://securetoken.googleapis.com/v1/token`;
                const url = `${baseUrl}?key=${FIREBASE_API_KEY}`;
                const params = new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token: refreshToken,
                });

                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: params.toString(),
                });

                const data = await response.json() as AuthResponse;

                if (data.error) {
                    return sendError(res, ErrorCodes.INVALID_TOKEN, data.error.message, HttpStatus.BAD_REQUEST);
                }

                return sendSuccess(res, {
                    idToken: data.id_token,
                    refreshToken: data.refresh_token,
                    expiresIn: data.expires_in,
                    userId: data.user_id,
                }, HttpStatus.OK);
    } catch (err) {
        next(err);
    }
};
