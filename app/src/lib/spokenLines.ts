import { AUTHORED_LINES, RETEACH_LINES } from "@/lib/authoredLines";
import { NUMBER_FRAMES, numberWordLexemes } from "@/lib/composeNumberAudio";
import { resolveAddress } from "@/lib/addressToken";
import { buildFeedbackBeat, buildGiveUpBeat, buildNudgeBeat, buildReteachBeats, buildRubricRevealBeat, type Beat, type LessonScript } from "@/lib/lessonOrchestrator";

/**
 * EVERY LINE THE RUNTIME CAN SPEAK (29 Sep 2026, docs/cms/content-inventory.md §16) — the voice actor's portal lists
 * exactly these, one row per distinct line (so one recording is one row: 43 "if right" rows used to share one clip).
 *
 * The lines come from the runtime's OWN sources, not a restatement of them:
 *   - every beat of the built script (its words, its candidates, its hook praise);
 *   - for every question, the orchestrator's own builders — both verdicts' feedback (both variants, and the miss that
 *     leads into a reteach), the touch nudge, the give-up (filled with that question's answer), the rubric reveal and
 *     the concept's reteach line (src/lib/lessonOrchestrator.ts — the functions the runtime calls);
 *   - every fixed line in AUTHORED_LINES and RETEACH_LINES that is not a {value} template (a template is spoken only
 *     filled — by the builders above — or split around a number: the number frames);
 *   - the number frames and the 77 number words any number is spoken with (src/lib/composeNumberAudio.ts).
 * src/lib/sourceAudit.test.ts keeps it honest from the other side: no module that speaks may hold a Sinhala literal of
 * its own, so there is no other place a spoken line can come from.
 */

export type SpokenGroup = "lesson" | "fixed lines" | "later sessions" | "per question" | "reteach" | "number frames" | "number words";

/** The order the portal presents the groups in: the lesson she reads through first, the reusable pieces after. */
export const SPOKEN_GROUPS: SpokenGroup[] = ["lesson", "fixed lines", "later sessions", "per question", "reteach", "number frames", "number words"];

export interface SpokenLine {
  /** Stable row id: the first beat that says it, `line:<key>`, `giveup:<beat>`, `rubric:<beat>`, `reteach:<concept>`, `frame:<name>:<half>`, `numberword:<word>`. */
  id: string;
  group: SpokenGroup;
  /** Exactly what is spoken — {address} resolved (the same word for every child, src/lib/addressToken.ts). */
  text: string;
  /** The beat that says it, when it is a script beat's own line. */
  beat?: Beat;
  /** How many places say this very line (a row stands for all of them). */
  uses: number;
}

const said = (text: string | null | undefined): string => (text ? resolveAddress(text, "unspecified").trim() : "");
const isTemplate = (text: string): boolean => text.includes("{value}");
const linesOf = (beat: Beat): string[] => [beat.spokenText, ...(beat.sayCandidates ?? []), beat.praiseText].map(said).filter(Boolean);

/** Every fixed line, by its key (an array's entries as key:index); templates left out. */
export function fixedLines(): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = [];
  for (const [key, value] of Object.entries(AUTHORED_LINES) as Array<[string, string | readonly string[]]>) {
    const entries = typeof value === "string" ? [[`line:${key}`, value]] : value.map((text, i) => [`line:${key}:${i}`, text]);
    for (const [id, text] of entries) if (!isTemplate(text!)) out.push({ id: id!, text: said(text) });
  }
  return out;
}

/** Everything the runtime can speak over this script, one entry per distinct line, in the portal's order. */
export function runtimeSpokenLines(script: LessonScript): SpokenLine[] {
  const byText = new Map<string, SpokenLine>();
  const add = (id: string, group: SpokenGroup, text: string, beat?: Beat) => {
    if (!text) return;
    const seen = byText.get(text);
    if (seen) seen.uses += 1;
    else byText.set(text, { id, group, text, beat, uses: 1 });
  };
  const authored = script.beats.filter((b) => b.id.startsWith("authored:"));
  const later = script.beats.filter((b) => !b.id.startsWith("authored:"));
  const questions = script.beats.filter((b) => b.expectedAnswer !== undefined && b.expectedAnswer !== null && b.expectedAnswer !== "");

  // 1. The lesson she reads through, in order.
  for (const beat of authored) for (const text of linesOf(beat)) add(beat.id, "lesson", text, beat);
  // 2. The fixed lines (feedback, nudges, the ladder, the warnings, the close…), by name.
  for (const line of fixedLines()) add(line.id, "fixed lines", line.text);
  // 3. The later sessions' lines (the transcript-derived concepts, the framing beats the builder inserts).
  for (const beat of later) for (const text of linesOf(beat)) add(beat.id, "later sessions", text, beat);
  // 4. What each question adds through the runtime's own builders.
  for (const beat of questions) {
    for (const built of [buildFeedbackBeat(beat, true, beat.expectedAnswer), buildFeedbackBeat(beat, false, beat.expectedAnswer), buildFeedbackBeat(beat, false, beat.expectedAnswer, { reteachFollows: true }), buildNudgeBeat(beat)]) {
      for (const text of linesOf(built)) add(`line:${built.id}`, "fixed lines", text);
    }
    for (const text of linesOf(buildGiveUpBeat(beat))) add(`giveup:${beat.id}`, "per question", text);
    if (beat.rubric) for (const text of linesOf(buildRubricRevealBeat(beat))) add(`rubric:${beat.id}`, "per question", text);
    const reteach = buildReteachBeats(script, beat, []).beats;
    for (const text of linesOf(reteach[0]!)) add(`reteach:${beat.conceptTag}`, "reteach", text);
    for (const demo of reteach.slice(1)) for (const text of linesOf(demo)) add(demo.id, "later sessions", text, demo);
  }
  // 5. Every concept's reteach line, whether or not a question of it is in this script yet.
  for (const [tag, text] of Object.entries(RETEACH_LINES)) add(`reteach:${tag}`, "reteach", said(text));
  // 6. Any number, in her voice: the frames it sits in, and its words.
  for (const [name, frame] of Object.entries(NUMBER_FRAMES)) {
    add(`frame:${name}:before`, "number frames", said(frame.before));
    add(`frame:${name}:after`, "number frames", said(frame.after));
  }
  for (const word of numberWordLexemes()) add(`numberword:${word}`, "number words", word);

  return SPOKEN_GROUPS.flatMap((group) => [...byText.values()].filter((line) => line.group === group));
}
