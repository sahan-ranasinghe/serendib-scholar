/**
 * Walks a built lesson script offline — no Live session, no audio, no
 * Gemini call, no cost.
 *
 * Prints, in order:
 *   1. the SESSION PLAN for the lesson (sittings, estimated minutes,
 *      concepts per sitting),
 *   2. the derived per-concept BLUEPRINT (copy into
 *      src/data/lessons/blueprints/<subject>-<grade>-<lesson>.json to
 *      hand-edit a concept's shape),
 *   3. the full beat list for one session (default: session 1),
 *   4. a simulated run against a scripted child.
 *
 *   npm run dry-run:lesson                    # session 1, child answers correctly
 *   npm run dry-run:lesson -- --session 2     # a later session's beat list
 *   npm run dry-run:lesson -- --beats 30 --child wrong|silent|offtopic
 *   npm run dry-run:lesson -- --include-unverified   # preview rows still awaiting review
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { buildScriptFromRows, type BankRow } from "../src/lib/lessonScriptBuilder";
import { LESSON_1_NUMBERS_STEPS, LESSON_1_NUMBERS_TITLE } from "../src/data/lessons/lesson1-numbers";
import {
  advance,
  beatSpec,
  buildDirectorLine,
  buildFeedbackBeat,
  buildWaitBeat,
  createInitialState,
  currentBeat,
  isLessonComplete,
  FRAMING_CONCEPT,
  type Beat,
  type LessonBlueprintOverride,
  type LessonScript,
  type OrchestratorState,
  type PlannerDecision,
} from "../src/lib/lessonOrchestrator";
import { answersMatch } from "../src/lib/answerCheck";

type ChildBehaviour = "correct" | "wrong" | "silent" | "offtopic";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const BEAT_LIMIT = Number(arg("beats", "10"));
const BEHAVIOUR = arg("child", "correct") as ChildBehaviour;
const SESSION = Number(arg("session", "1")) - 1;
const INCLUDE_UNVERIFIED = process.argv.includes("--include-unverified");

function childSays(beat: Beat): string {
  if (beatSpec(beat.type).onChildResponse !== "judge") return "";
  switch (BEHAVIOUR) {
    case "correct":
      return beat.expectedAnswer ?? "";
    case "wrong":
      return "දාහක්";
    case "silent":
      return "";
    case "offtopic":
      return "මගේ අයියාට බයිසිකලයක් තියෙනවා";
  }
}

/** The planner, offline — deterministic half only, so a dry run costs nothing. */
function offlinePlanner(beat: Beat, said: string): PlannerDecision {
  if (!said.trim()) return { understood: false, next: "simplify", reason: "No answer given." };
  if (beat.expectedAnswer && answersMatch(beat.expectedAnswer, said)) {
    return { understood: true, next: "advance", reason: "Exact match." };
  }
  return { understood: false, next: "another_example", reason: "Did not match (offline planner)." };
}

function describeBoardAction(beat: Beat): string {
  switch (beat.board.kind) {
    case "stage_item":
      return `stage item ${beat.board.itemId.slice(0, 8)}`;
    case "reveal_part":
      return `write "${beat.board.value}" into row ${beat.board.rowIndex} ${beat.board.field}`;
    case "set_active_blank":
      return `highlight row ${beat.board.rowIndex} ${beat.board.field}`;
    case "title_card":
      return `title card "${`${beat.board.emoji ?? ""} ${beat.board.title}`.trim()}"`;
    case "none":
      return "unchanged";
  }
}

const minutes = (seconds: number) => (seconds / 60).toFixed(1);

function printSessionPlan(script: LessonScript): void {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`SESSION PLAN — ${script.subject} grade ${script.grade} lesson ${script.lesson}`);
  console.log(
    `${script.sessions.length} sessions, ${script.beats.length} beats, ` +
      `${minutes(script.sessions.reduce((sum, s) => sum + s.estimatedSeconds, 0))} estimated minutes total`,
  );
  console.log("=".repeat(78));
  for (const session of script.sessions) {
    const beats = script.beats.slice(session.firstBeat, session.lastBeat + 1);
    const counts = beats.reduce<Record<string, number>>((acc, b) => ((acc[b.type] = (acc[b.type] ?? 0) + 1), acc), {});
    console.log(
      `  session ${session.index + 1}: ~${minutes(session.estimatedSeconds)} min, ${beats.length} beats — ` +
        `concepts: ${session.conceptTags.join(", ") || "(framing only)"}`,
    );
    console.log(
      `    ${Object.entries(counts)
        .map(([type, count]) => `${type}×${count}`)
        .join("  ")}`,
    );
  }
}

/**
 * Reads the hand-edit override file the same way the server wrapper does
 * (which is server-only and can't be imported here). Loud either way, so
 * "my override isn't applying" is never a silent mystery again.
 */
async function loadOverride(subject: string, grade: number, lesson: number): Promise<LessonBlueprintOverride | null> {
  const file = path.join(process.cwd(), "src/data/lessons/blueprints", `${subject}-${grade}-${lesson}.json`);
  let json: string;
  try {
    json = await readFile(file, "utf8");
  } catch {
    console.log(`Blueprint override: none (no file at ${path.relative(process.cwd(), file)}).`);
    return null;
  }
  try {
    const parsed = JSON.parse(json) as LessonBlueprintOverride;
    if (!Array.isArray(parsed?.concepts)) {
      console.log(`Blueprint override: FILE FOUND but it has no "concepts" array — IGNORED.`);
      return null;
    }
    console.log(
      `Blueprint override: ${path.relative(process.cwd(), file)} — entries for: ` +
        parsed.concepts.map((c) => c.conceptTag).join(", "),
    );
    return parsed;
  } catch (error) {
    console.log(`Blueprint override: FILE FOUND but is not valid JSON — IGNORED. (${String(error)})`);
    return null;
  }
}

function printBlueprint(script: LessonScript): void {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`BLUEPRINT (${script.blueprint.derivedFrom})`);
  console.log("=".repeat(78));
  if (script.blueprint.overriddenConcepts?.length) {
    console.log(`  OVERRIDDEN by the blueprint file: ${script.blueprint.overriddenConcepts.join(", ")}`);
  }
  if (script.blueprint.unmatchedOverrideTags?.length) {
    console.log(
      `  !! override entries matching NO concept (typo?): ${script.blueprint.unmatchedOverrideTags.join(", ")}`,
    );
  }
  for (const concept of script.blueprint.concepts) {
    console.log(
      `  ${concept.conceptTag.padEnd(24)} video ~${String(concept.videoMinutes).padStart(2)} min → ` +
        `explain×${concept.explainBeats}, items ${concept.items.mode1}/${concept.items.mode2}/${concept.items.mode3}` +
        `${concept.hookExample ? `, hook: "${concept.hookExample.slice(0, 50)}"` : ", no hook (no everyday example in her data)"}`,
    );
  }
}

function printSessionBeats(script: LessonScript, sessionIndex: number): void {
  const session = script.sessions[sessionIndex];
  if (!session) {
    console.log(`No session ${sessionIndex + 1}.`);
    return;
  }
  console.log(`\n${"=".repeat(78)}`);
  console.log(
    `BEAT LIST — session ${sessionIndex + 1}/${script.sessions.length} ` +
      `(~${minutes(session.estimatedSeconds)} min, concepts: ${session.conceptTags.join(", ")})`,
  );
  console.log("=".repeat(78));
  for (let i = session.firstBeat; i <= session.lastBeat; i += 1) {
    const beat = script.beats[i];
    const concept = beat.conceptTag === FRAMING_CONCEPT ? "—" : beat.conceptTag;
    console.log(
      `  ${String(i).padStart(3)}. ${beat.type.padEnd(13)} ${String(beatSpec(beat.type).estimateSeconds).padStart(3)}s ` +
        `| ${concept.padEnd(22)} | board: ${describeBoardAction(beat)}`,
    );
    console.log(`       goal: ${beat.goal.slice(0, 130)}`);
    if (beat.expectedAnswer) console.log(`       expects: ${beat.expectedAnswer}`);
    if (beat.referenceWording)
      console.log(`       reference (${beat.referenceWording.length} chars): ${beat.referenceWording.slice(0, 90)}…`);
  }
}

function dryRun(script: LessonScript, startBeat: number): void {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`DRY RUN — ${BEAT_LIMIT} beats from beat ${startBeat}, simulated child answers: ${BEHAVIOUR}`);
  console.log("=".repeat(78));

  let state: OrchestratorState = createInitialState(startBeat);
  const queue: Beat[] = [];
  let spoken = 0;
  let waitIssuedFor: string | null = null;

  while (spoken < BEAT_LIMIT && !isLessonComplete(script, state)) {
    const scripted = queue.length === 0;
    const beat = scripted ? currentBeat(script, state) : queue.shift()!;
    if (!beat) break;

    spoken += 1;
    console.log(
      `\n[${String(spoken).padStart(2)}] ${beat.type}  ` +
        `(session ${beat.sessionIndex + 1}, concept ${beat.conceptTag || "—"}, mode ${beat.mode ?? "—"}, ` +
        `unaided ${state.unaidedCorrect}/2, misses ${state.recentMisses})`,
    );
    console.log(`     APP → board: ${describeBoardAction(beat)}`);
    console.log(`     APP → model: ${buildDirectorLine(beat).slice(0, 320)}`);

    if (!scripted) {
      console.log(`     (inserted beat — script position unchanged)`);
      continue;
    }

    if (beatSpec(beat.type).onChildResponse === "judge") {
      const said = childSays(beat);
      if (!said.trim()) {
        if (waitIssuedFor !== beat.id) {
          waitIssuedFor = beat.id;
          console.log(`     CHILD: (silence > 8s)`);
          queue.push(buildWaitBeat(beat));
          continue;
        }
        console.log(`     CHILD: (silence again — planning against no answer)`);
      } else {
        console.log(`     CHILD: "${said}"`);
      }
      const decision = offlinePlanner(beat, said);
      console.log(`     PLANNER: understood=${decision.understood} next=${decision.next} — ${decision.reason ?? ""}`);
      queue.push(buildFeedbackBeat(beat, decision.understood, beat.expectedAnswer));
      const result = advance(script, state, decision);
      state = result.state;
      if (result.movedConcept) console.log(`     >>> concept complete`);
      continue;
    }

    const result = advance(script, state, null);
    state = result.state;
    if (result.movedConcept) console.log(`     >>> concept complete`);
  }

  const landed = currentBeat(script, state);
  console.log(
    `\nEnded at beat ${state.beatIndex} (${landed?.type ?? "end"}), ` +
      `unaidedCorrect=${state.unaidedCorrect}, recentMisses=${state.recentMisses}.`,
  );
}

async function main() {
  let query = supabaseAdmin
    .from("content_bank")
    .select("id, concept_tag, difficulty, component_type, component_props, answer, explanation, source, verified")
    .eq("subject", "maths")
    .eq("grade", 5)
    .eq("lesson", 1);
  if (!INCLUDE_UNVERIFIED) query = query.eq("verified", true);
  const { data, error } = await query;
  if (error) throw new Error(`content_bank lookup failed: ${error.message}`);
  const rows = (data ?? []) as (BankRow & { verified: boolean })[];
  const unverified = rows.filter((row) => !row.verified);
  if (unverified.length > 0) {
    console.log(
      `NOTE: --include-unverified is on — ${unverified.length} row(s) are NOT yet verified and stay ` +
        `EXCLUDED from live sessions until verified: ${unverified.map((r) => `${r.concept_tag} (${r.source})`).join("; ")}`,
    );
  }

  const descriptions = new Map(LESSON_1_NUMBERS_STEPS.map((step) => [step.conceptTag, step.conceptDescription]));
  const blueprintOverride = await loadOverride("maths", 5, 1);
  const script = buildScriptFromRows(rows, descriptions, "maths", 5, 1, { blueprintOverride, lessonTitle: LESSON_1_NUMBERS_TITLE });

  printSessionPlan(script);
  printBlueprint(script);
  printSessionBeats(script, SESSION);
  dryRun(script, script.sessions[SESSION]?.firstBeat ?? 0);
  await runAssertions(script, rows);
}

/**
 * Structural invariants, checked on every dry run so regressions announce
 * themselves here instead of in a live session with a child.
 */
async function runAssertions(script: LessonScript, rows: (BankRow & { verified: boolean })[]): Promise<void> {
  console.log(`\n${"=".repeat(78)}`);
  console.log("ASSERTIONS");
  console.log("=".repeat(78));

  // 1. Every non-chat beat runs against a non-empty board: it either
  //    stages something (item, cell patch, title card) or inherits content
  //    staged earlier in the same session. Sessions start empty.
  let sessionIndex = -1;
  let boardHasContent = false;
  for (const beat of script.beats) {
    if (beat.sessionIndex !== sessionIndex) {
      sessionIndex = beat.sessionIndex;
      boardHasContent = false;
    }
    if (beat.board.kind === "stage_item" || beat.board.kind === "title_card") boardHasContent = true;
    const isChat = beat.type === "CHAT_OPENER" || beat.type === "BREAK_CHAT";
    if (!isChat) {
      assert.ok(
        boardHasContent,
        `beat ${beat.id} (${beat.type}) would run against an EMPTY board — every non-chat beat needs a visual`,
      );
    }
  }
  console.log("  PASS  every non-chat beat has board content (staged or inherited within its session)");

  // 2. Concept 1's first SHOW_BOARD stages a real abacus with real digits.
  const firstConcept = script.concepts[0];
  const firstShow = script.beats
    .slice(firstConcept.firstBeat, firstConcept.lastBeat + 1)
    .find((beat) => beat.type === "SHOW_BOARD");
  assert.ok(firstShow && firstShow.board.kind === "stage_item", "concept 1 has a SHOW_BOARD staging an item");
  const stagedRow = rows.find((row) => firstShow.board.kind === "stage_item" && row.id === firstShow.board.itemId);
  assert.ok(stagedRow, "the staged item exists in content_bank");
  assert.equal(
    stagedRow!.component_type,
    "AbacusDiagram",
    `concept 1's first SHOW_BOARD must stage an AbacusDiagram (got ${stagedRow!.component_type})`,
  );
  const digits = (stagedRow!.component_props as { digits?: unknown }).digits;
  assert.ok(
    Array.isArray(digits) && digits.length >= 3 && digits.every((d) => typeof d === "number"),
    "the staged abacus has a real digits array",
  );
  console.log(
    `  PASS  concept 1's first SHOW_BOARD stages AbacusDiagram with digits [${(digits as number[]).join(", ")}]`,
  );

  // 3. The director channel never touches the caption path: director text
  //    goes out only as a next_beat tool result — the runtime must contain
  //    no clientContent send of it, and the caption renders only model
  //    output transcription.
  await assertDirectorChannel();
}

async function assertDirectorChannel(): Promise<void> {
  const hook = await readFile(path.join(process.cwd(), "src/hooks/useGeminiLive.ts"), "utf8");
  assert.ok(
    !/sendTextInput\([^)]*buildDirectorLine/.test(hook),
    "useGeminiLive must never send director text as clientContent",
  );
  assert.ok(/handleNextBeat/.test(hook) && /call\.name === "next_beat"/.test(hook), "director text flows via the next_beat tool result");
  const host = await readFile(path.join(process.cwd(), "src/components/HostScreen.tsx"), "utf8");
  assert.ok(/\{outputTranscript\}/.test(host), "the caption renders outputTranscript");
  assert.ok(!/\{inputTranscript\}/.test(host), "the caption never renders input/client text");
  assert.ok(!host.includes("[DIRECTOR]"), "no [DIRECTOR] text in the caption component");
  console.log("  PASS  no [DIRECTOR] text in the caption path (tool-result channel only, caption = model speech)");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
