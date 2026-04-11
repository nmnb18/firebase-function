import { Request, Response, NextFunction } from "express";
import { auth } from "../../config/firebase";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const reauthenticateHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

                const { currentPassword } = req.body;
                const authHeader = req.headers.authorization;

                if (!authHeader) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Missing token", HttpStatus.UNAUTHORIZED);
                }

                const idToken = authHeader.replace("Bearer ", "").trim();
                const decoded = await auth.verifyIdToken(idToken);

                const email = decoded.email;
                if (!email) {
                    return sendError(res, ErrorCodes.INVALID_INPUT, "Email not found", HttpStatus.BAD_REQUEST);
                }

                if (!currentPassword) {
                    return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Current password required", HttpStatus.BAD_REQUEST);
                }

                const API_KEY = process.env.API_KEY;

                // 🔥 Validate password by trying to sign in
                const response = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email,
                            password: currentPassword,
                            returnSecureToken: false
                        }),
                    }
                );

                const result = await response.json() as any;

                if (result.error) {
                    return sendError(res, ErrorCodes.UNAUTHORIZED, "Incorrect password", HttpStatus.BAD_REQUEST);
                }

                return sendSuccess(res, { message: "Authenticated successfully" }, HttpStatus.OK);

    } catch (err) {
        next(err);
    }
};