import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "../../src/lib/supabaseAdmin";
import { buildScriptFromRows, type BankRow } from "../../src/lib/lessonScriptBuilder";
import { parseAuthoredScript } from "../../src/lib/authoredScript";
import { CONCEPT_DESCRIPTIONS } from "../../src/lib/lessonDesign";
import { LESSON_1_NUMBERS_TITLE } from "../../src/data/lessons/lesson1-numbers";
import type { LessonScript } from "../../src/lib/lessonOrchestrator";

/**
 * The lesson script built offline the way the server builds it (src/lib/buildLessonScript.ts, which scripts cannot
 * import: it is server-only) — the verified content_bank rows, the authored script and, with `actorWording`, the voice
 * actor's accepted re-wordings overlaid (what the child actually hears).
 */
export async function buildOfflineScript(options: { actorWording?: boolean } = {}): Promise<LessonScript> {
  const { data, error } = await supabaseAdmin
    .from("content_bank")
    .select("id, concept_tag, difficulty, component_type, component_props, answer, explanation, source")
    .eq("subject", "maths")
    .eq("grade", 5)
    .eq("lesson", 1)
    .eq("verified", true);
  if (error) throw new Error(`content_bank lookup failed: ${error.message}`);
  const file = parseAuthoredScript(await readFile(path.join(process.cwd(), "src/data/lessons/authored", "maths-5-1.json"), "utf8").catch(() => null));
  let authoredScript = file;
  if (file && options.actorWording) {
    const { data: lines } = await supabaseAdmin.from("actor_lines").select("beat_id, actor_text").eq("status", "accepted");
    const accepted = new Map(((lines ?? []) as Array<{ beat_id: string; actor_text: string | null }>).flatMap((l) => (l.actor_text ? [[l.beat_id, l.actor_text] as const] : [])));
    authoredScript = { ...file, beats: file.beats.map((beat) => (accepted.has(beat.id) ? { ...beat, spokenText: accepted.get(beat.id)! } : beat)) };
  }
  return buildScriptFromRows((data ?? []) as BankRow[], new Map(Object.entries(CONCEPT_DESCRIPTIONS)), "maths", 5, 1, { lessonTitle: LESSON_1_NUMBERS_TITLE, authoredScript });
}
