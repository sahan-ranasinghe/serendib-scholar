/**
 * The actor's work, in the database.
 *
 * Everything the portal knows about a session lives in `actor_lines` and
 * `actor_takes` (DDL in supabase/schema.sql), never in the browser and
 * never in the repo. Three things follow from that, and they are the whole
 * reason this module exists:
 *
 *   - a dropped connection costs at most the take in progress; reloading
 *     the page restores every saved take,
 *   - she can start on a laptop and finish on a phone,
 *   - her wording and her notes survive a deploy, which the old
 *     write-to-the-repo-file version could not (it refused to run in
 *     production at all).
 */
import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const PORTAL_LESSON = "maths-5-1";

export type ActorLineStatus = "pending" | "accepted" | "rejected" | "note_only";
/**
 * uploading → pending_processing → saved (in storage, awaiting review) → approved | rejected.
 * Only an APPROVED take is served to a child under VOICE_PROFILE=human (src/app/api/clip/[key]/route.ts); a new take
 * of the same line (the same clip key) takes every earlier approval of that clip away until it is reviewed again.
 */
export type ActorTakeStatus = "uploading" | "saved" | "pending_processing" | "failed" | "approved" | "rejected";

export interface ActorLine {
  beat_id: string;
  original_text: string;
  actor_text: string | null;
  note: string | null;
  status: ActorLineStatus;
  updated_at: string;
}

export interface ActorTake {
  beat_id: string;
  lesson: string;
  clip_key: string | null;
  raw_path: string | null;
  clip_path: string | null;
  opus_path: string | null;
  duration_ms: number | null;
  sentences: Array<{ startMs: number; endMs: number }> | null;
  trim_start_ms: number;
  trim_end_ms: number | null;
  status: ActorTakeStatus;
  peak_dbfs: number | null;
  noise_dbfs: number | null;
  updated_at: string;
}

/**
 * A missing table is reported, not thrown past: the portal must still load
 * and tell her what is wrong rather than showing a blank page. Every
 * caller treats an empty result as "nothing recorded yet".
 */
function warn(what: string, error: { message?: string } | null): void {
  if (error) console.error(`[actorStore] ${what} failed — has supabase/schema.sql been run? ${error.message ?? error}`);
}

export async function listTakes(lesson = PORTAL_LESSON): Promise<ActorTake[]> {
  const { data, error } = await supabaseAdmin.from("actor_takes").select("*").eq("lesson", lesson);
  warn("listTakes", error);
  return (data ?? []) as ActorTake[];
}

export async function getTake(beatId: string): Promise<ActorTake | null> {
  const { data, error } = await supabaseAdmin.from("actor_takes").select("*").eq("beat_id", beatId).maybeSingle();
  warn("getTake", error);
  return (data ?? null) as ActorTake | null;
}

export async function upsertTake(take: Partial<ActorTake> & { beat_id: string }): Promise<ActorTake | null> {
  const row = { lesson: PORTAL_LESSON, ...take, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin.from("actor_takes").upsert(row).select().maybeSingle();
  warn("upsertTake", error);
  return (data ?? null) as ActorTake | null;
}

export async function deleteTake(beatId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("actor_takes").delete().eq("beat_id", beatId);
  warn("deleteTake", error);
}

export async function listLines(): Promise<ActorLine[]> {
  const { data, error } = await supabaseAdmin.from("actor_lines").select("*");
  warn("listLines", error);
  return (data ?? []) as ActorLine[];
}

export async function upsertLine(line: Partial<ActorLine> & { beat_id: string; original_text: string }): Promise<void> {
  const { error } = await supabaseAdmin
    .from("actor_lines")
    .upsert({ ...line, updated_at: new Date().toISOString() });
  warn("upsertLine", error);
}

/**
 * Her accepted re-wordings, as a beat_id → text map.
 *
 * This is what the script builder consults, so a line she re-worded and a
 * human accepted is what the child hears — without the authored JSON
 * having been touched. Only 'accepted' rows count: 'pending' is a take
 * nobody has judged, and 'rejected' drifted.
 */
export async function acceptedActorText(): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("actor_lines")
    .select("beat_id,actor_text")
    .eq("status", "accepted")
    .not("actor_text", "is", null);
  warn("acceptedActorText", error);
  return new Map((data ?? []).map((row) => [row.beat_id as string, row.actor_text as string]));
}

/** Every take of this clip key (a line recorded under an older row id is still the same clip). */
export async function takesForClip(clipKeyValue: string): Promise<ActorTake[]> {
  const { data, error } = await supabaseAdmin.from("actor_takes").select("*").eq("clip_key", clipKeyValue);
  warn("takesForClip", error);
  return (data ?? []) as ActorTake[];
}

/**
 * A new take of this clip replaces its audio: every approval of it lapses (approved → saved) until a reviewer hears
 * the new one. The approved-key cache is dropped so the runtime stops serving it at once.
 */
export async function withdrawApproval(clipKeyValue: string): Promise<void> {
  const { error } = await supabaseAdmin.from("actor_takes").update({ status: "saved", updated_at: new Date().toISOString() }).eq("clip_key", clipKeyValue).eq("status", "approved");
  warn("withdrawApproval", error);
  approvedCache = null;
}

/** A reviewer's verdict on the take of this clip (behind the portal password, /portal/status). */
export async function setTakeReview(clipKeyValue: string, verdict: "approved" | "rejected"): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("actor_takes")
    .update({ status: verdict, updated_at: new Date().toISOString() })
    .eq("clip_key", clipKeyValue)
    .in("status", ["saved", "approved", "rejected"])
    .select("beat_id");
  warn("setTakeReview", error);
  approvedCache = null;
  return (data ?? []).length;
}

let approvedCache: { at: number; keys: Set<string> } | null = null;
const APPROVED_TTL_MS = 60_000;

/** The clip keys a reviewer has approved — what VOICE_PROFILE=human may serve. Cached for a minute per server. */
export async function approvedClipKeys(): Promise<Set<string>> {
  if (approvedCache && Date.now() - approvedCache.at < APPROVED_TTL_MS) return approvedCache.keys;
  const { data, error } = await supabaseAdmin.from("actor_takes").select("clip_key").eq("status", "approved");
  warn("approvedClipKeys", error);
  const keys = new Set(((data ?? []) as Array<{ clip_key: string | null }>).flatMap((r) => (r.clip_key ? [r.clip_key] : [])));
  approvedCache = { at: Date.now(), keys };
  return keys;
}
