import { supabaseAdmin } from "./supabaseClient";

/**
 * The "get_available_subjects" capability: queries syllabus_chunks (via the
 * available_syllabus_subjects() Postgres function — see supabase/schema.sql)
 * for the distinct (subject, grade, medium) combinations actually ingested
 * right now.
 *
 * Called once per session, server-side, before the ephemeral Gemini token is
 * minted (src/app/api/gemini-session/route.ts) — the result gets baked
 * directly into that session's system prompt (see buildSystemPrompt in
 * src/lib/prompt.ts) so the assistant only ever offers or engages with
 * subjects that have real content, and never assumes coverage that doesn't
 * exist. Deliberately not wired up as a live-callable Gemini tool: by the
 * time a session starts talking, this has already run and its answer is
 * already in the prompt, so there's nothing left for the model to call.
 */
export interface AvailableSubject {
  subject: string;
  grade: number;
  medium: string;
}

export async function getAvailableSubjects(): Promise<AvailableSubject[]> {
  const { data, error } = await supabaseAdmin.rpc("available_syllabus_subjects");
  if (error) throw error;
  return (data ?? []) as AvailableSubject[];
}
