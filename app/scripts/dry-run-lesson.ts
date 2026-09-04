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
  estimateBeatSeconds,
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
import { listAuthoredLines } from "../src/lib/authoredLines";

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
    case "abacus_set":
      return `abacus set [${beat.board.digits.join(",")}]${beat.board.animate ? " (self-animating)" : beat.board.startEmpty ? " (empty, beads to come)" : " (complete)"}`;
    case "abacus_add_bead":
      return `abacus: ${beat.board.count} bead(s) onto rod ${beat.board.rod}`;
    case "show_components":
      return `show ${beat.board.components.map((c) => c.type).join("+")}`;
    case "text_card":
      return `chalk text card (${beat.board.text.length} chars)`;
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
      `  ${String(i).padStart(3)}. ${beat.type.padEnd(13)} ${String(estimateBeatSeconds(beat)).padStart(3)}s ` +
        `| ${concept.padEnd(22)} | board: ${describeBoardAction(beat)}`,
    );
    if (beat.spokenText) console.log(`       say: ${beat.spokenText.slice(0, 150)}`);
    else console.log(`       goal: ${beat.goal.slice(0, 130)}`);
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

  console.log(`\n${"=".repeat(78)}`);
  console.log("AUTHORED SINHALA LINES (developer-written, for native-speaker review — src/lib/authoredLines.ts)");
  console.log("=".repeat(78));
  for (const [label, line] of listAuthoredLines()) {
    console.log(`  ${label.padEnd(30)} ${line}`);
  }

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
    if (["stage_item", "title_card", "abacus_set", "show_components", "text_card"].includes(beat.board.kind)) boardHasContent = true;
    const isChat = beat.type === "CHAT_OPENER" || beat.type === "BREAK_CHAT";
    if (!isChat) {
      assert.ok(
        boardHasContent,
        `beat ${beat.id} (${beat.type}) would run against an EMPTY board — every non-chat beat needs a visual`,
      );
    }
  }
  console.log("  PASS  every non-chat beat has board content (staged or inherited within its session)");

  // 2. Concept 1's first SHOW_BOARD stages the animated abacus with real digits.
  const firstConcept = script.concepts[0];
  const firstShow = script.beats
    .slice(firstConcept.firstBeat, firstConcept.lastBeat + 1)
    .find((beat) => beat.type === "SHOW_BOARD");
  assert.ok(
    firstShow && firstShow.board.kind === "abacus_set",
    `concept 1's first SHOW_BOARD must stage the animated abacus (got ${JSON.stringify(firstShow?.board)})`,
  );
  const digits = firstShow.board.kind === "abacus_set" ? firstShow.board.digits : [];
  assert.ok(
    digits.length >= 3 && digits.every((d) => typeof d === "number"),
    "the staged abacus has a real digits array",
  );
  console.log(`  PASS  concept 1's first SHOW_BOARD stages the animated abacus with digits [${digits.join(", ")}]`);

  // 3. Every explanation row's boardContent is staged somewhere in that
  //    row's run of beats — what she wrote is what the child sees, aligned
  //    to when she says it (blocks spread across the segment's beats; the
  //    board persists between stagings, so unstaged beats inherit).
  const explanationRows = rows.filter((row) => row.component_type === "explanation");
  for (const row of explanationRows) {
    const boardContent = String((row.explanation as { boardContent?: unknown } | null)?.boardContent ?? "");
    if (boardContent.trim() === "") continue;
    const rowBeats = script.beats.filter(
      (beat) => beat.itemId === row.id && (beat.type === "EXPLAIN" || beat.type === "SOFT_CHECK" || beat.type === "ASK") && beat.spokenText,
    );
    if (rowBeats.length === 0) continue;
    const staged = rowBeats.filter((beat) => beat.board.kind !== "none").length;
    assert.ok(
      staged >= 1,
      `explanation row ${row.source} has boardContent but none of its ${rowBeats.length} beats stage anything`,
    );
  }
  console.log("  PASS  every explanation row's boardContent is staged within its run of beats");

  // 4. Concept 1's 5421 introduction stages the self-animating abacus,
  //    aligned to a beat of her own speech (the boardContent "5 4 2 1"
  //    block from the segment where she demonstrates it).
  const intro5421 = script.beats.find(
    (beat) =>
      (beat.type === "EXPLAIN" || beat.type === "SOFT_CHECK") &&
      beat.conceptTag === script.concepts[0].conceptTag &&
      beat.spokenText !== undefined &&
      beat.board.kind === "abacus_set" &&
      beat.board.animate === true &&
      beat.board.digits.join(",") === "5,4,2,1",
  );
  assert.ok(intro5421, "a spoken beat in concept 1 stages abacus_set([5,4,2,1], animate)");
  console.log(
    `  PASS  the 5421 introduction stages the animated abacus with [5,4,2,1] while she says: "${intro5421!.spokenText!.slice(0, 60)}…"`,
  );

  // 5. Abacus item demos: beads land per reveal and finish the number.
  const abacusShows = script.beats.filter(
    (beat) => beat.type === "SHOW_BOARD" && beat.board.kind === "abacus_set" && beat.board.startEmpty,
  );
  assert.ok(abacusShows.length > 0, "at least one abacus demonstration starts with bare rods");
  for (const show of abacusShows) {
    if (show.board.kind !== "abacus_set") continue;
    const shown = show.board.digits.map(() => 0);
    for (let i = script.beats.indexOf(show) + 1; i < script.beats.length; i += 1) {
      const beat = script.beats[i];
      if (beat.itemId !== show.itemId || beat.segmentIndex !== show.segmentIndex) break;
      if (beat.board.kind === "abacus_add_bead") shown[beat.board.rod] += beat.board.count;
    }
    // A MODE 2 demo deliberately reveals only part before asking — every
    // landed bead must at least match its rod's digit exactly or stay short.
    show.board.digits.forEach((digit, rod) => {
      assert.ok(shown[rod] === digit || shown[rod] === 0 || shown[rod] <= digit,
        `${show.id}: rod ${rod} got ${shown[rod]} beads for digit ${digit}`);
    });
  }
  console.log(`  PASS  abacus demos land beads per reveal (${abacusShows.length} demo(s) simulated)`);

  // 6. Concept 1's explain run is her real transcript: ~40-50 spoken
  //    beats and ~10-12 minutes of speech, matching approximateMinutesSpent.
  const c1 = script.concepts[0];
  const c1Spoken = script.beats
    .slice(c1.firstBeat, c1.lastBeat + 1)
    .filter((b) => (b.type === "EXPLAIN" || b.type === "SOFT_CHECK" || b.type === "ASK") && b.spokenText);
  const c1Seconds = c1Spoken.reduce((sum, b) => sum + estimateBeatSeconds(b), 0);
  // (Retuned after the three-pause-type split: soft checks close chunks
  // more often than the old damped check-ins did, so the same ~11.5 min of
  // her speech now spans more, shorter beats.)
  assert.ok(
    c1Spoken.length >= 45 && c1Spoken.length <= 72,
    `concept 1 should have ~50-70 transcript beats, got ${c1Spoken.length}`,
  );
  assert.ok(
    c1Seconds >= 9.5 * 60 && c1Seconds <= 12.5 * 60,
    `concept 1's spoken time should be ~10-12 min, got ${(c1Seconds / 60).toFixed(1)} min`,
  );
  console.log(
    `  PASS  concept 1 explain run: ${c1Spoken.length} transcript beats, ~${(c1Seconds / 60).toFixed(1)} min of her speech`,
  );

  // 7. Session 1's turn-taking shape: at most 8 real ASK waits, zero
  //    mandatory yes/no questions, rhetoric stays inline as pause markers.
  const s1 = script.beats.slice(script.sessions[0].firstBeat, script.sessions[0].lastBeat + 1);
  const s1Asks = s1.filter((b) => b.type === "ASK");
  const s1Softs = s1.filter((b) => b.type === "SOFT_CHECK");
  const s1Rhetorical = s1.reduce((n, b) => n + (b.spokenText?.match(/\?…/gu)?.length ?? 0), 0);
  assert.ok(s1Asks.length <= 8, `session 1 should have ≤8 ASK beats, got ${s1Asks.length}`);
  for (const ask of s1Asks) {
    assert.ok(
      !/(නේද|හරිද|තේරුණාද|එහෙමද)\s*\?\s*$/u.test(ask.spokenText ?? ""),
      `ASK ${ask.id} demands a yes/no reply: ${ask.spokenText?.slice(0, 60)}`,
    );
  }
  console.log(
    `  PASS  session 1 pause types: RHETORICAL(inline)=${s1Rhetorical}, SOFT_CHECK=${s1Softs.length}, ASK=${s1Asks.length} (≤8, none yes/no)`,
  );

  // 8. Nothing the tutor is given to SAY contains instruction vocabulary.
  // "ඊළඟ එකට යන්න" is the imperative the live leak produced (an instruction
  // read at the child); her own "ඊළඟ එකට යමු" ("let's move on") is real
  // teacher speech and allowed — verbatim transcripts contain it.
  const FORBIDDEN_IN_SPEECH = ["ඊළඟ එකට යන්න", "beat", "goal", "next", "instruction"];
  for (const b of script.beats) {
    for (const text of [b.spokenText, ...(b.sayCandidates ?? [])]) {
      if (!text) continue;
      for (const bad of FORBIDDEN_IN_SPEECH) {
        assert.ok(
          !text.toLowerCase().includes(bad.toLowerCase()),
          `speech for ${b.id} contains instruction vocabulary "${bad}": ${text.slice(0, 80)}`,
        );
      }
    }
  }
  console.log("  PASS  no instruction vocabulary in anything the tutor is given to say");

  // 8. The director channel never touches the caption path: director text
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
  const screen = await readFile(path.join(process.cwd(), "src/components/LessonScreen.tsx"), "utf8");
  assert.ok(/\{outputTranscript\}/.test(screen), "the caption renders outputTranscript");
  assert.ok(!/\{inputTranscript\}/.test(screen), "the caption never renders input/client text");
  assert.ok(!screen.includes("[DIRECTOR]"), "no [DIRECTOR] text in the caption component");
  console.log("  PASS  no [DIRECTOR] text in the caption path (tool-result channel only, caption = model speech)");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
