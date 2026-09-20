/**
 * Renders the lesson's speech to cached clips, once, in the pinned voice.
 *
 * The runtime no longer holds a live voice session open while she teaches:
 * every scripted line is a stored clip, played back by the app. This is
 * what fills that cache. It is safe to re-run — anything already rendered
 * is skipped — and it prints every line with its duration so a native
 * speaker can review the pacing before a child hears it.
 *
 *   npm run render:audio                  # session 1 (default)
 *   npm run render:audio -- --session 3
 *   npm run render:audio -- --all
 *   npm run render:audio -- --gender girl # clips for a girl child
 *   npm run render:audio -- --limit 20    # first N unrendered lines only
 *
 * RENDERING IS A PAID CALL AND IS OFF BY DEFAULT (src/lib/paidCalls.ts): run
 * it as `CLIP_RENDER=on npm run render:audio` — deliberately. Without the
 * switch the script only reports what is cached and what is missing.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { buildScriptFromRows, type BankRow } from "../src/lib/lessonScriptBuilder";
import { LESSON_1_NUMBERS_STEPS, LESSON_1_NUMBERS_TITLE } from "../src/data/lessons/lesson1-numbers";
import { ensureAudioBucket, ensureClip, readCachedClip } from "../src/lib/liveTts";
import { AUTHORED_LINES } from "../src/lib/authoredLines";
import { parseAuthoredScript } from "../src/lib/authoredScript";
import { resolveAddress, type ChildGender } from "../src/lib/addressToken";
import { ZARA_VOICE } from "../src/lib/zaraVoice";
import type { Beat, LessonBlueprintOverride } from "../src/lib/lessonOrchestrator";

function flag(name: string, fallback: string | null = null): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const SUBJECT = flag("subject", "maths")!;
const GRADE = Number(flag("grade", "5"));
const LESSON = Number(flag("lesson", "1"));
const GENDER = (flag("gender", "boy") as ChildGender) ?? "boy";
const ALL = process.argv.includes("--all");
const SESSION = Number(flag("session", "1"));
const LIMIT = Number(flag("limit", "0"));
/** Each render is its own short-lived Live connection, so a few run at once. */
const CONCURRENCY = Math.max(1, Math.min(8, Number(flag("concurrency", "4"))));

/** Every distinct line a beat can speak, in the order the child would hear them. */
function linesOfBeat(beat: Beat): string[] {
  const lines: string[] = [];
  if (beat.spokenText) lines.push(beat.spokenText);
  for (const candidate of beat.sayCandidates ?? []) lines.push(candidate);
  // The {value} lines the RUNTIME builds from a question's own answer. They
  // are known here, so they belong in the batch: the bottom of the silence
  // ladder is the worst possible moment to make a stuck child wait half a
  // minute for a line to render.
  if (beat.expectedAnswer) {
    lines.push(AUTHORED_LINES.giveUpReveal.replace("{value}", beat.expectedAnswer));
    lines.push(AUTHORED_LINES.confirmHeard.replace("{value}", beat.expectedAnswer));
  }
  return lines;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  // The script is built here rather than fetched through the server
  // wrapper (which is server-only): identical inputs, identical beats.
  const { data, error } = await supabaseAdmin
    .from("content_bank")
    .select("id, concept_tag, difficulty, component_type, component_props, answer, explanation, source, verified")
    .eq("subject", SUBJECT)
    .eq("grade", GRADE)
    .eq("lesson", LESSON)
    .eq("verified", true);
  if (error) throw new Error(`content_bank lookup failed: ${error.message}`);
  const descriptions = new Map(LESSON_1_NUMBERS_STEPS.map((step) => [step.conceptTag, step.conceptDescription]));
  const overrideFile = path.join(process.cwd(), "src/data/lessons/blueprints", `${SUBJECT}-${GRADE}-${LESSON}.json`);
  let blueprintOverride: LessonBlueprintOverride | null = null;
  try {
    blueprintOverride = JSON.parse(await readFile(overrideFile, "utf8")) as LessonBlueprintOverride;
  } catch {
    blueprintOverride = null;
  }
  // Render what the child will actually HEAR: the approved authored
  // script when there is one (clips are keyed by their words, so a newly
  // approved script simply renders a new set).
  const authoredScript = parseAuthoredScript(
    await readFile(
      path.join(process.cwd(), "src/data/lessons/authored", `${SUBJECT}-${GRADE}-${LESSON}.json`),
      "utf8",
    ).catch(() => null),
  );
  if (authoredScript) {
    console.log(
      authoredScript.approved
        ? `Authored script: APPROVED — rendering Zara's original words for ${authoredScript.concepts.join(", ")}.`
        : "Authored script: written but NOT APPROVED — rendering the transcript-derived words.",
    );
  }
  const script = buildScriptFromRows((data ?? []) as BankRow[], descriptions, SUBJECT, GRADE, LESSON, {
    blueprintOverride,
    lessonTitle: LESSON_1_NUMBERS_TITLE,
    authoredScript,
  });
  const sessions = ALL ? script.sessions : script.sessions.filter((s) => s.index === SESSION - 1);
  if (sessions.length === 0) throw new Error(`No session ${SESSION} in this script (it has ${script.sessions.length}).`);

  // The beats in scope, plus every authored line the runtime can reach at
  // any moment (ladder rungs, feedback, acknowledgements) — those belong
  // in the cache regardless of which session is being rendered.
  const beats = sessions.flatMap((session) => script.beats.slice(session.firstBeat, session.lastBeat + 1));
  const scriptedLines = beats.flatMap(linesOfBeat);
  const authored = Object.values(AUTHORED_LINES).flatMap((value) =>
    Array.isArray(value) ? value : [value],
  ) as string[];

  // Resolved for THIS child's address form, deduplicated: the same
  // sentence said in five places is one clip.
  const texts = [...new Set([...scriptedLines, ...authored].map((line) => resolveAddress(line, GENDER)))]
    .map((line) => line.trim())
    .filter(Boolean)
    // {value} templates (the give-up reveal) are per-answer: rendered on
    // demand at runtime, not here.
    .filter((line) => !line.includes("{"));

  console.log(
    `Rendering ${ALL ? "the whole lesson" : `session ${SESSION}`} — ${beats.length} beats, ` +
      `${texts.length} distinct lines, voice ${ZARA_VOICE}, address form: ${GENDER}\n`,
  );
  await ensureAudioBucket();
  if (process.env.CLIP_RENDER !== "on") console.log("CLIP_RENDER is not on: nothing will be rendered — cached lines are listed, missing ones are reported as FAILED.\n");

  let rendered = 0;
  let cached = 0;
  let failed = 0;
  let totalMs = 0;
  let cursor = 0;

  const renderOne = async (text: string, index: number) => {
    try {
      const existing = await readCachedClip(text);
      const clip = existing ?? (await ensureClip(text, apiKey));
      totalMs += clip.durationMs;
      if (existing) cached += 1;
      else rendered += 1;
      const seconds = (clip.durationMs / 1000).toFixed(1);
      console.log(
        `${String(index).padStart(4)}. ${existing ? "cached" : "RENDER"} ${seconds.padStart(6)}s  ` +
          `${clip.sentences.length} sentence(s)\n      ${text}`,
      );
    } catch (error) {
      failed += 1;
      console.error(`${String(index).padStart(4)}. FAILED  ${text.slice(0, 70)}…\n      ${String(error).slice(0, 140)}`);
    }
  };

  // A pool of workers over the line list: rendering is almost entirely
  // waiting on the voice API, so a handful at a time turns an hour of
  // batch time into minutes. Output carries each line's index, since
  // completion order is no longer input order.
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      if (LIMIT > 0 && rendered >= LIMIT) return;
      const index = cursor;
      cursor += 1;
      if (index >= texts.length) return;
      await renderOne(texts[index], index + 1);
    }
  });
  await Promise.all(workers);
  if (LIMIT > 0 && rendered >= LIMIT) console.log(`\nStopping at --limit ${LIMIT} newly rendered clips.`);

  console.log(
    `\n${rendered} rendered, ${cached} already cached, ${failed} failed — ` +
      `${(totalMs / 60000).toFixed(1)} minutes of speech in the cache for this scope.`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
