/**
 * Shared rate-limit / transient-error retry handling for Gemini API calls.
 *
 * Extracted from scripts/ingest-syllabus.ts (which still uses it for its
 * embed and vision-transcription calls) so scripts/extract-lesson-plan.ts
 * retries identically rather than keeping a second, drifting copy of the
 * same rules.
 */

// The free/standard tier rate-limits fairly aggressively — a long batch of
// calls in quick succession starts returning 429 RESOURCE_EXHAUSTED. These
// constants control retry-with-backoff for that, plus other transient
// errors (503 UNAVAILABLE, deadline-exceeded).
/** Total attempts (1 initial + 4 retries). */
export const RETRY_MAX_ATTEMPTS = 5;
/** Backoff between attempts: 2s, 5s, 12s, then 12s again. */
export const RETRY_DELAYS_MS = [2000, 5000, 12000, 12000];

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Classifies an error thrown by a Gemini API call (checking @google/genai's
 * ApiError shape's numeric `status` field, or the equivalent text in a bare
 * Error's message) and returns a short reason for the retry log line, or
 * null if it isn't one of these known-transient cases:
 *   - 429 RESOURCE_EXHAUSTED — rate limit.
 *   - 500 INTERNAL — server-side blip. Observed for real on a long
 *     video-extraction run (one segment out of ten), where it aborted the
 *     rest of the run; it succeeds on a retry, so treat it like the other
 *     transient failures rather than a hard stop.
 *   - 503 UNAVAILABLE / 504 deadline-exceeded — transient server-side
 *     timeouts, not a quota problem, but just as safe to retry the same way.
 */
export function classifyRetryableApiError(error: unknown): string | null {
  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  const cause = error instanceof Error && error.cause ? String(error.cause) : "";
  const message = `${error instanceof Error ? error.message : String(error)} ${cause}`;

  // BILLING is never transient: retrying a depleted account or an
  // exceeded spend cap burns time against a wall. Abort immediately so
  // the caller can checkpoint and report.
  if (/prepayment credits|spending cap/i.test(message)) {
    return null;
  }
  // Network-level failures — undici connect timeouts, resets, DNS blips.
  // Observed live: a mid-run "fetch failed / ConnectTimeoutError" killed
  // an authoring run that would have succeeded seconds later.
  if (
    /fetch failed|ConnectTimeoutError|UND_ERR_CONNECT_TIMEOUT|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|ENOTFOUND|network/i.test(
      message,
    )
  ) {
    return "network failure";
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|\b429\b/i.test(message)) {
    return "rate limited";
  }
  if (
    status === 500 ||
    status === 503 ||
    status === 504 ||
    /UNAVAILABLE|\b500\b|\b503\b|\bINTERNAL\b|DEADLINE_EXCEEDED|deadline exceeded/i.test(message)
  ) {
    return "transient server error";
  }
  return null;
}

/**
 * Runs `call`, retrying it with the same exponential backoff ingest-syllabus.ts
 * uses for exactly the transient errors classifyRetryableApiError recognizes.
 * Anything else (a bad request, an auth failure) rethrows immediately —
 * retrying those just burns time and quota. `logPrefix` is prepended to the
 * retry log lines so nested progress output stays readable.
 */
export async function withRetry<T>(call: () => Promise<T>, logPrefix = "  "): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const retryReason = classifyRetryableApiError(error);
      if (!retryReason || attempt >= RETRY_MAX_ATTEMPTS) {
        throw error;
      }
      const delayMs = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
      console.warn(
        `${logPrefix}${retryReason}, retrying in ${delayMs / 1000}s... (attempt ${attempt}/${RETRY_MAX_ATTEMPTS - 1} retries)`,
      );
      await sleep(delayMs);
    }
  }
}
