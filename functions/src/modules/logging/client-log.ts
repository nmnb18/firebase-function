/**
 * POST /clientLog
 *
 * Ingests front-end log batches (crashes, network errors, manual events).
 *
 * Auth: OPTIONAL — anonymous clients (pre-login / crashed screens) are
 * accepted. If a valid Bearer token is present, user_id is attached to
 * every persisted log entry for traceability.
 *
 * Validation: clientLogBatchSchema (Zod) is applied by validateBody()
 * at the route level in app.ts.
 *
 * Rate limit: clientLogRateLimit is applied at the route level in app.ts.
 */

import { Request, Response } from "express";
import { auth } from "../../config/firebase";
import { sendSuccess } from "../../utils/response";
import { persistClientLog } from "../../utils/error-persistence";
import { logger } from "../../utils/logger";
import type { ClientLogEntry } from "../../validation/client-log.schemas";

export const clientLogHandler = async (req: Request, res: Response): Promise<void> => {
    // ── Optional auth — extract user_id if a valid Bearer token is present ──
    let userId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        try {
            const decoded = await auth.verifyIdToken(authHeader.slice(7));
            userId = decoded.uid;
        } catch {
            // Invalid / expired token — proceed anonymously, do not reject
        }
    }

    const logs: ClientLogEntry[] = req.body.logs;

    // Persist all entries fire-and-forget so the response is instant.
    // persistClientLog() is internally safe and will never throw.
    void Promise.allSettled(
        logs.map((log) => persistClientLog(log, userId)),
    );

    logger.debug(
        "clientLog: received batch",
        { count: logs.length, appId: logs[0]?.appId, userId: userId ?? "anonymous" },
        req,
    );

    sendSuccess(res, { received: logs.length });
};
