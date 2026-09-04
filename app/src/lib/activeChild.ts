import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ChildGender } from "@/lib/addressToken";

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

export interface ActiveChild {
  id: string;
  displayName: string;
  grade: number;
  medium: string;
  gender: ChildGender;
}

/**
 * The active child's row, gender included — the server-side companion to
 * getActiveChildId(). Tolerates the gender column not existing yet (before
 * the ALTER has run) and any lookup failure by defaulting to
 * "unspecified": the lesson must never be blocked on demographics.
 */
export async function getActiveChild(): Promise<ActiveChild> {
  const id = getActiveChildId();
  try {
    const { data } = await supabaseAdmin.from("children").select("*").eq("id", id).maybeSingle();
    const gender =
      data?.gender === "boy" || data?.gender === "girl" ? (data.gender as ChildGender) : "unspecified";
    return {
      id,
      displayName: typeof data?.display_name === "string" ? data.display_name : "",
      grade: typeof data?.grade === "number" ? data.grade : 5,
      medium: typeof data?.medium === "string" ? data.medium : "sinhala",
      gender,
    };
  } catch {
    return { id, displayName: "", grade: 5, medium: "sinhala", gender: "unspecified" };
  }
}
