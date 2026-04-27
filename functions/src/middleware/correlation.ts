/**
 * Correlation Middleware (T2-02.2)
 *
 * Injects a UUID correlation ID into every incoming request so that
 * log entries, Firestore error docs, and API responses can all be
 * linked back to a single request.
 *
 * • Accepts an existing X-Correlation-ID header from the client so
 *   mobile apps can correlate their own trace IDs.
 * • Echos the ID back in the X-Correlation-ID response header.
 * • Attaches the ID to `req.correlationId` for use in handlers and
 *   other middleware.
 * • Records request start/finish to Cloud Logging at INFO level.
 */

import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger";

// Extend Express Request type so handlers can read req.correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      sanitizedBody?: unknown;
    }
  }
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-correlation-id"];
  const id = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();

  req.correlationId = id;
  res.setHeader("X-Correlation-ID", id);

  const start = Date.now();

  logger.info("→ request", {
    method: req.method,
    path: req.path,
    userAgent: req.headers["user-agent"] ?? "unknown",
    remoteIp: (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim()
      ?? req.socket?.remoteAddress
      ?? "unknown",
  }, req);

  res.on("finish", () => {
    const ms = Date.now() - start;
    const uid = (req as any).user?.uid as string | undefined;
    const errorCode = res.locals.errorCode as string | undefined;

    const meta: Record<string, unknown> = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      ms,
      ...(uid ? { userId: uid } : {}),
      ...(errorCode ? { errorCode } : {}),
    };

    if (ms > 3000) {
      logger.warn(`⚠ slow response ${ms}ms on ${req.method} ${req.path}`, meta, req);
    }

    if (res.statusCode >= 400) {
      logger.warn("← response", meta, req);
    } else {
      logger.info("← response", meta, req);
    }
  });

  next();
}
