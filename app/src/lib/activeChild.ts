import "server-only";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ChildGender } from "@/lib/addressToken";
import { verifyToken } from "@/lib/sessionAuth";

/** The onboarding grant: which child this device belongs to (signed, kind "child"). */
export const CHILD_COOKIE = "ss_child";

/**
 * THE one place the active child's identity comes from.
 *
 * Onboarding (the profile step) creates a row in `children` and sets a
 * signed ss_child cookie naming it; that cookie wins. Until a device has
 * been through onboarding, DEV_CHILD_ID — a test row in `children` — is
 * the fallback, so everything that needs a real child id (session_log,
 * child_progress, the RECAP beats) keeps working on a dev machine. Every
 * server route and page that needs the id calls this, and no client code
 * ever supplies one.
 *
 * Server-only on purpose: the id identifies a real child and is written to
 * FK-checked tables, so the browser is never trusted to say who is present
 * (the cookie is HMAC-signed by the server that minted it).
 */
export async function getActiveChildId(): Promise<string> {
  const fromCookie = await childIdFromCookie();
  if (fromCookie) return fromCookie;
  const id = process.env.DEV_CHILD_ID;
  if (!id || !id.trim()) {
    throw new Error(
      "No child on this device and DEV_CHILD_ID is not set. Point it at a row in the `children` table (see supabase/schema.sql), or run onboarding.",
    );
  }
  return id.trim();
}

/** Whether a child exists at all for this request (onboarding done, or the dev fallback). */
export async function hasActiveChild(): Promise<boolean> {
  try {
    await getActiveChildId();
    return true;
  } catch {
    return false;
  }
}

async function childIdFromCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    const claims = await verifyToken(jar.get(CHILD_COOKIE)?.value, "child");
    return claims?.child_id ?? null;
  } catch {
    // Outside a request (a build-time prerender): no cookie jar, no child.
    return null;
  }
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
  const id = await getActiveChildId();
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
