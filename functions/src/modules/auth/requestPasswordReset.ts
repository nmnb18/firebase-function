import { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError, ErrorCodes, HttpStatus } from "../../utils/response";

export const requestPasswordResetHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

            const { email } = req.body;

            if (!email) {
                return sendError(res, ErrorCodes.MISSING_REQUIRED_FIELD, "Email is required", HttpStatus.BAD_REQUEST);
            }

            const apiKey = process.env.API_KEY;
            if (!apiKey) {
                return sendError(res, ErrorCodes.INTERNAL_ERROR, "Missing Firebase API Key", HttpStatus.INTERNAL_SERVER_ERROR);
            }

            const payload = {
                requestType: "PASSWORD_RESET",
                email,
            };

            const response = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            );

            const data = await response.json() as any;

            if (data.error) {
                return sendError(res, ErrorCodes.INVALID_INPUT, data.error.message, HttpStatus.BAD_REQUEST);
            }

            return sendSuccess(res, { message: "Password reset email sent." }, HttpStatus.OK);

    } catch (err) {
        next(err);
    }
};
