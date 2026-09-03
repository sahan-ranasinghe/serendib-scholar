import "server-only";

/**
 * THE one place the active child's identity comes from.
 *
 * Today it is an env var pointing at a test row in the `children` table —
 * good enough to build and test everything that needs a real child id
 * (session_log, child_progress, the RECAP beats). When a real
 * login/onboarding flow exists, this function reads the session instead,
 * and nothing else in the codebase changes: every server route that needs
 * the id calls this, and no client code ever supplies one.
 *
 * Server-only on purpose: the id identifies a real child and is written to
 * FK-checked tables, so the browser is never trusted to say who is present.
 */
export function getActiveChildId(): string {
  const id = process.env.DEV_CHILD_ID;
  if (!id || !id.trim()) {
    throw new Error(
      "DEV_CHILD_ID is not set. Point it at a row in the `children` table (see supabase/schema.sql).",
    );
  }
  return id.trim();
}
