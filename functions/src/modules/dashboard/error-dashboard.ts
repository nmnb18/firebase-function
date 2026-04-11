/**
 * Error Dashboard — Admin-only endpoint (T2-03.3)
 *
 * GET /admin/errorDashboard
 *
 * Returns aggregated error statistics from the Firestore `error_logs`
 * collection for the past 7 days. Callers must be authenticated as
 * an admin (role === "admin" in user_profiles).
 *
 * Response shape:
 * {
 *   summary: { total_unique_errors, total_occurrences, period }
 *   errors_by_code:     { [code]: occurrences }
 *   errors_by_endpoint: { [endpoint]: occurrences }
 *   recent_errors:      ErrorLog[]   (top 20 most recently seen)
 * }
 */

import { Request, Response, NextFunction } from "express";
import { db } from "../../config/firebase";
import { authenticateUser } from "../../middleware/auth";
import { sendSuccess, HttpStatus } from "../../utils/response";
import { AuthenticationError, AuthorizationError } from "../../utils/errors";

export const errorDashboardHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // ── 1. Auth ─────────────────────────────────────────────────────────
    const currentUser = await authenticateUser(req.headers.authorization);
    if (!currentUser?.uid) {
      throw new AuthenticationError();
    }

    // ── 2. Role check ────────────────────────────────────────────────────
    const profileSnap = await db.collection("user_profiles").doc(currentUser.uid).get();
    if (profileSnap.data()?.role !== "admin") {
      throw new AuthorizationError("Admin access required");
    }

    // ── 3. Query error_logs ──────────────────────────────────────────────
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const snap = await db
      .collection("error_logs")
      .where("resolved", "==", false)
      .where("last_seen", ">=", since)
      .orderBy("last_seen", "desc")
      .limit(200)
      .get();

    const errors = snap.docs.map((d) => ({ error_id: d.id, ...d.data() })) as Array<
      Record<string, any>
    >;

    // ── 4. Aggregate ─────────────────────────────────────────────────────
    const byCode: Record<string, number>     = {};
    const byEndpoint: Record<string, number> = {};
    let totalOccurrences = 0;

    for (const e of errors) {
      const occ = (e.occurrences as number) ?? 1;
      byCode[e.error_code]       = (byCode[e.error_code] ?? 0) + occ;
      byEndpoint[e.endpoint]     = (byEndpoint[e.endpoint] ?? 0) + occ;
      totalOccurrences           += occ;
    }

    return sendSuccess(
      res,
      {
        summary: {
          total_unique_errors: errors.length,
          total_occurrences: totalOccurrences,
          period: "last_7_days",
        },
        errors_by_code: byCode,
        errors_by_endpoint: byEndpoint,
        recent_errors: errors.slice(0, 20),
      },
      HttpStatus.OK,
    );
  } catch (err) {
    next(err);
  }
};
