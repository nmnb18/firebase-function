import { ZodSchema, ZodError, ZodIssue } from "zod";
import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../utils/errors";

function formatZodMessage(error: ZodError): string {
    return error.errors
        .map((e: ZodIssue) => (e.path.length > 0 ? `${e.path.join(".")}: ${e.message}` : e.message))
        .join("; ");
}

/**
 * Express middleware factory that validates req.body against the given Zod
 * schema and replaces req.body with the parsed/coerced output on success.
 * On failure it forwards a ValidationError(400) to the error handler.
 */
export function validateBody(schema: ZodSchema) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return next(new ValidationError(formatZodMessage(result.error)));
        }
        req.body = result.data;
        next();
    };
}

/**
 * Express middleware factory that validates req.query against the given Zod
 * schema. On failure it forwards a ValidationError(400) to the error handler.
 */
export function validateQuery(schema: ZodSchema) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            return next(new ValidationError(formatZodMessage(result.error)));
        }
        next();
    };
}
