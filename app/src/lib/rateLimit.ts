import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Server-side spending budgets, counted in Postgres (api_rate_limits in
 * supabase/schema.sql) so they hold across serverless instances — no Redis,
 * no new service. A bucket is one row: a window start and a count; when the
 * window has passed, the row resets.
 *
 * Budgets (enforced in the routes that spend the money):
 *   - /api/hear:        40 calls / 10 min / session
 *   - /api/speak-line:  20 on-demand renders / session (4h window = the
 *                       session cookie's own lifetime)
 *   - live chat:        15 min / day / child, charged conservatively at
 *                       5 min per chat opening (see gemini-session)
 *
 * FAIL-OPEN, LOUDLY: if the table is missing or Postgres is unreachable,
 * the request is allowed and an error is logged. A missing rate limiter
 * must degrade to "no limiter", never to "no lesson" — but it is never
 * silent, so a deployment without the table cannot look hardened.
 *
 * The read-then-write is not atomic; two racing requests can share a slot.
 * That is acceptable for an abuse brake (the budget is off by at most the
 * race width, not unbounded).
 */

export interface BudgetResult {
  allowed: boolean;
  /** How much of the window's budget is used (after this take). */
  used: number;
  limit: number;
}

export async function takeBudget(
  bucket: string,
  limit: number,
  windowSeconds: number,
  cost = 1,
): Promise<BudgetResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("api_rate_limits")
      .select("window_started_at, count")
      .eq("bucket", bucket)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const now = Date.now();
    const windowExpired = !data || now - new Date(data.window_started_at).getTime() > windowSeconds * 1000;
    const current = windowExpired ? 0 : data.count;
    if (current + cost > limit) {
      console.warn(`[rateLimit] 429 bucket=${bucket} used=${current}/${limit}`);
      return { allowed: false, used: current, limit };
    }
    const { error: writeError } = await supabaseAdmin.from("api_rate_limits").upsert(
      {
        bucket,
        window_started_at: windowExpired ? new Date(now).toISOString() : data!.window_started_at,
        count: current + cost,
      },
      { onConflict: "bucket" },
    );
    if (writeError) throw new Error(writeError.message);
    return { allowed: true, used: current + cost, limit };
  } catch (error) {
    console.error(
      `[rateLimit] Budget check unavailable for ${bucket} — ALLOWING (run the api_rate_limits DDL in ` +
        `supabase/schema.sql to enforce budgets): ${String(error).slice(0, 140)}`,
    );
    return { allowed: true, used: 0, limit };
  }
}

/** The friendly 429 payload every limited route returns. */
export function limitedResponseBody() {
  return {
    ok: false,
    error: "rate_limited",
    message: "අද වැඩ ගොඩක් කළා! පොඩ්ඩක් ඉන්න, පස්සේ ආයෙ උත්සාහ කරන්න.",
  };
}
