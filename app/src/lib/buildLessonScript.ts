import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildScriptFromRows, type BankRow } from "@/lib/lessonScriptBuilder";
import type { LessonBlueprintOverride, LessonScript } from "@/lib/lessonOrchestrator";

/**
 * Server-side wrapper around the pure script builder: fetches the verified
 * content_bank rows for a lesson, builds the script from them, and caches
 * the result in lesson_scripts.
 */

/**
 * Bump when the script SHAPE changes (new beat types, session structure,
 * blueprint fields…): it salts the fingerprint, so cached scripts built by
 * an older builder are rebuilt instead of served with a shape the runtime
 * no longer understands.
 */
const SCRIPT_FORMAT_VERSION = "2";

/**
 * A fingerprint of the verified rows a script was built from, salted with
 * the script format version. Stored with the cached script so verifying
 * more content_bank rows, re-running the populate script, OR changing the
 * builder's output shape invalidates it automatically rather than silently
 * serving a stale lesson.
 */
export function fingerprintRows(rows: { id: string }[], overrideJson = ""): string {
  const hash = createHash("sha256");
  hash.update(`format:${SCRIPT_FORMAT_VERSION};`);
  // The override file shapes the script just as much as the rows do —
  // editing it must invalidate the cache, not require deleting the row.
  hash.update(`override:${overrideJson};`);
  for (const id of rows.map((row) => row.id).sort()) hash.update(id);
  return hash.digest("hex").slice(0, 32);
}

export interface BuildLessonScriptResult {
  script: LessonScript;
  fingerprint: string;
  fromCache: boolean;
}

/**
 * Builds (or returns the cached) lesson script for one lesson.
 *
 * The cache is keyed on (subject, grade, lesson) and guarded by the
 * fingerprint above, so a stale script is never served: if the bank has
 * changed, this rebuilds and overwrites.
 */
export async function buildLessonScript(
  subject: string,
  grade: number,
  lesson: number,
  options: { forceRebuild?: boolean } = {},
): Promise<BuildLessonScriptResult> {
  const normalizedSubject = subject.trim().toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("content_bank")
    .select("id, concept_tag, difficulty, component_type, component_props, answer, explanation, source")
    .eq("subject", normalizedSubject)
    .eq("grade", grade)
    .eq("lesson", lesson)
    .eq("verified", true);
  if (error) throw new Error(`content_bank lookup failed: ${error.message}`);

  const rows = (data ?? []) as BankRow[];
  const overrideJson = await readBlueprintOverrideFile(normalizedSubject, grade, lesson);
  const fingerprint = fingerprintRows(rows, overrideJson ?? "");

  if (!options.forceRebuild) {
    const cached = await supabaseAdmin
      .from("lesson_scripts")
      .select("script, content_fingerprint, built_at")
      .eq("subject", normalizedSubject)
      .eq("grade", grade)
      .eq("lesson", lesson)
      .maybeSingle();
    if (!cached.error && cached.data?.content_fingerprint === fingerprint) {
      return { script: cached.data.script as LessonScript, fingerprint, fromCache: true };
    }
  }

  const descriptions = await conceptDescriptions();
  const blueprintOverride = parseBlueprintOverride(overrideJson);
  const script = buildScriptFromRows(rows, descriptions, normalizedSubject, grade, lesson, { blueprintOverride });

  const { error: upsertError } = await supabaseAdmin.from("lesson_scripts").upsert(
    {
      subject: normalizedSubject,
      grade,
      lesson,
      script,
      content_fingerprint: fingerprint,
      built_at: script.builtAt,
    },
    { onConflict: "subject,grade,lesson" },
  );
  if (upsertError) {
    // A cache write failing shouldn't take the lesson down — the script is
    // already built and perfectly usable in memory.
    console.error("[buildLessonScript] Could not cache script:", upsertError.message);
  }

  return { script, fingerprint, fromCache: false };
}

/**
 * One-line descriptions per concept tag, from the lesson's own
 * hand-transcribed data (the tags in content_bank were assigned from it).
 * Imported lazily so this server module doesn't pull the lesson data into
 * every bundle that touches the orchestrator types.
 */
async function conceptDescriptions(): Promise<Map<string, string>> {
  const { LESSON_1_NUMBERS_STEPS } = await import("@/data/lessons/lesson1-numbers");
  return new Map(LESSON_1_NUMBERS_STEPS.map((step) => [step.conceptTag, step.conceptDescription]));
}

/**
 * The hand-edited per-concept blueprint file, if one is checked in at
 * src/data/lessons/blueprints/<subject>-<grade>-<lesson>.json. Entries are
 * merged FIELD BY FIELD over the derived blueprint by conceptTag (see
 * buildScriptFromRows), so a human can adjust one concept's hook or
 * practice volume without restating the rest. Raw JSON is read separately
 * from parsing because the fingerprint hashes the file content.
 */
export function blueprintOverridePath(subject: string, grade: number, lesson: number): string {
  return path.join(process.cwd(), "src/data/lessons/blueprints", `${subject}-${grade}-${lesson}.json`);
}

async function readBlueprintOverrideFile(subject: string, grade: number, lesson: number): Promise<string | null> {
  try {
    return await readFile(blueprintOverridePath(subject, grade, lesson), "utf8");
  } catch {
    return null; // No override file — the derived blueprint stands.
  }
}

export function parseBlueprintOverride(json: string | null): LessonBlueprintOverride | null {
  if (json === null) return null;
  try {
    const parsed = JSON.parse(json) as LessonBlueprintOverride;
    return Array.isArray(parsed?.concepts) ? parsed : null;
  } catch (error) {
    // A malformed override must be loud, not silently ignored.
    console.error("[buildLessonScript] Blueprint override file is not valid JSON — IGNORING it:", error);
    return null;
  }
}
