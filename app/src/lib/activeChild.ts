import "server-only";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ChildGender } from "@/lib/addressToken";
import { verifyToken } from "@/lib/sessionAuth";

/** The onboarding grant: which child this device belongs to (signed, kind "child"). */
export const CHILD_COOKIE = "ss_child";

/** Thrown when no child is bound to this device: the caller sends the parent to onboarding. */
export class NoChildError extends Error {
  constructor() {
    super("no_child");
    this.name = "NoChildError";
  }
}

/**
 * THE one place the active child's identity comes from.
 *
 * Identity is device-bound: onboarding (the profile step) creates a row in
 * `children` and sets a signed ss_child cookie naming it, and every
 * server route and page that needs the id calls this — no client code
 * ever supplies one. A device with no child is sent to onboarding by the
 * splash (src/app/(app)/page.tsx) and by every child page.
 *
 * A development machine may point DEV_CHILD_ID at a test row, but only
 * with DEV_MODE=on and only in a development build: the production
 * bundle has no code path to it (process.env.NODE_ENV is fixed at build
 * time, so the branch below is compiled out — scripts/session-check.ts
 * asserts the built server code never mentions the variable).
 *
 * Server-only on purpose: the id identifies a real child and is written to
 * FK-checked tables, so the browser is never trusted to say who is present
 * (the cookie is HMAC-signed by the server that minted it).
 */
export async function getActiveChildId(): Promise<string> {
  const fromCookie = await childIdFromCookie();
  if (fromCookie) return fromCookie;
  if (process.env.NODE_ENV !== "production") {
    const dev = devChildId();
    if (dev) return dev;
  }
  throw new NoChildError();
}

/** Development only: the test child from the environment, when DEV_MODE is on. Never reached in a production build. */
function devChildId(): string | null {
  if (process.env.DEV_MODE !== "on") return null;
  const id = (process.env.DEV_CHILD_ID ?? "").trim();
  return id || null;
}

/** Whether a child is bound to this device (onboarding done, or the dev fallback in a dev build). */
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

/**
 * The children this device may switch between: the active child and any
 * sharing its parent contact (the phone from onboarding). Empty when no
 * child is bound.
 */
export async function childrenOnDevice(): Promise<Array<{ id: string; name: string; grade: number; active: boolean }>> {
  let activeId: string;
  try {
    activeId = await getActiveChildId();
  } catch {
    return [];
  }
  const { data: me } = await supabaseAdmin.from("children").select("id, display_name, grade, parent_contact").eq("id", activeId).maybeSingle();
  if (!me) return [];
  let rows = [me];
  if (me.parent_contact) {
    const { data } = await supabaseAdmin.from("children").select("id, display_name, grade, parent_contact").eq("parent_contact", me.parent_contact).order("created_at");
    if (data?.length) rows = data;
  }
  return rows.map((c) => ({ id: c.id, name: c.display_name, grade: c.grade, active: c.id === activeId }));
}

/** Whether `target` is one of this device's children (the same parent contact as the active child). */
export async function isChildOnDevice(target: string): Promise<boolean> {
  return (await childrenOnDevice()).some((c) => c.id === target);
}
