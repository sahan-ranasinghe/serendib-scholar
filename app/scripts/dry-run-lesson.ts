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
 *   4. a simulated run against a scripted child,
 *   5. the ITEM LEDGER — every textbook item of the authored concepts and
 *      every blank within it: asked, demonstrated, or deferred to a named
 *      session (0 uncovered is the gate) — with the exercise units the
 *      packer keeps whole and the same-sentence event timelines.
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
import { buildScriptFromRows, exerciseUnits, insideExerciseUnit, type BankRow } from "../src/lib/lessonScriptBuilder";
import { blanksForItem } from "../src/lib/lessonBlanks";
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
import { answersMatch, exampleAnswerFor, parseAnswerPredicate } from "../src/lib/answerCheck";
import { ANSWER_MODES, READING_PRACTICE, SPEECH_PRIMARY, TOUCH_SURFACE, conceptSkill } from "../src/lib/answerMode";
import { validateChoices } from "../src/lib/distractors";
import { judgePhraseLocally } from "../src/lib/phraseJudge";
import { isNumberWord } from "../src/lib/sinhalaNumber";
import { announcesTutorTurn, listAuthoredLines } from "../src/lib/authoredLines";
import { parseAuthoredScript, type AuthoredScriptFile } from "../src/lib/authoredScript";
import { describeStage, eventKey, initialStage, isKnownEvent, reduceStage, rodsNamedIn, rowOfCards, type Storyboard } from "../src/lib/choreography";
import { sentencesOf } from "../src/lib/scriptDistance";
import { checkSpeechRules, formatSpeechFindings } from "../src/lib/speechRules";
import { formatCoverage, voiceCoverage } from "../src/lib/voiceCoverage";
import { voiceProfile } from "../src/lib/humanClips";

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
      return exampleAnswerFor(beat.expectedAnswer);
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
      return beat.board.adds
        ? `abacus: ${beat.board.adds.map((a) => `${a.count} onto rod ${a.rod}`).join(", ")}`
        : `abacus: ${beat.board.count} bead(s) onto rod ${beat.board.rod}`;
    case "show_components":
      return `show ${beat.board.components.map((c) => c.type).join("+")}`;
    case "text_card":
      return `chalk text card (${beat.board.text.length} chars)`;
    case "clear":
      return "CLEAR the board";
    case "built_number":
      return "the child's built number + its name, under the picker";
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
  // The authored (original) script rides the same approved-only gate the
  // server uses, so the dry run always shows what a child would hear.
  const authoredScript = parseAuthoredScript(
    await readFile(path.join(process.cwd(), "src/data/lessons/authored", "maths-5-1.json"), "utf8").catch(() => null),
  );
  if (authoredScript) {
    console.log(
      authoredScript.approved
        ? `Authored script: APPROVED — ${authoredScript.beats.length} original beats replace ${authoredScript.concepts.join(", ")}.`
        : `Authored script: ${authoredScript.beats.length} beats written but NOT APPROVED — transcript-derived script stands.`,
    );
  } else {
    console.log("Authored script: none (npm run author:script).");
  }
  const script = buildScriptFromRows(rows, descriptions, "maths", 5, 1, {
    blueprintOverride,
    lessonTitle: LESSON_1_NUMBERS_TITLE,
    authoredScript,
  });

  // Every developer-authored Sinhala line, tabulated for native review.
  console.log(`\n${"=".repeat(78)}\nAUTHORED LINES (for native-speaker review)\n${"=".repeat(78)}`);
  for (const [key, text] of listAuthoredLines()) console.log(`  ${key.padEnd(28)} ${text}`);

  printSessionPlan(script);
  printBlueprint(script);
  printSessionBeats(script, SESSION);
  dryRun(script, script.sessions[SESSION]?.firstBeat ?? 0);
  await runAssertions(script, rows, authoredScript);
}

/**
 * Structural invariants, checked on every dry run so regressions announce
 * themselves here instead of in a live session with a child.
 */
async function runAssertions(
  script: LessonScript,
  rows: (BankRow & { verified: boolean })[],
  authoredScript: AuthoredScriptFile | null,
): Promise<void> {
  console.log(`\n${"=".repeat(78)}`);
  console.log("ASSERTIONS");
  console.log("=".repeat(78));

  // First, because it is about the authored words themselves rather than
  // the assembled script: it must report even when a later structural
  // assertion aborts the run.
  assertSpeechRules(authoredScript);
  await reportVoiceCoverage(authoredScript);

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

  // 2. The place-value concept's first SHOW_BOARD stages the animated
  //    abacus with real digits. (Since the design re-map, the abacus lives
  //    in placeValue4Digit — the guide's activity 2 — not in concept 1.)
  const abacusConcept = script.concepts.find((c) => c.conceptTag === "placeValue4Digit");
  assert.ok(abacusConcept, "the script contains the placeValue4Digit concept");
  // (The merged concept also holds the 4-digit breakdown tables, which can
  // stage first — the abacus demo just has to be in there with real digits.)
  // The abacus is staged bare by the spoken beat that announces it
  // (":34 අද අපි ගණක රාමුවකින් … හදන්නයි", a TRANSITION); the SHOW_BOARD
  // beats after it land the beads. Any spoken beat may do the staging.
  const firstShow = script.beats
    .slice(abacusConcept!.firstBeat, abacusConcept!.lastBeat + 1)
    .find((beat) => beat.spokenText !== undefined && beat.board.kind === "abacus_set");
  assert.ok(
    firstShow && firstShow.board.kind === "abacus_set",
    "placeValue4Digit must contain a spoken beat staging the abacus",
  );
  const digits = firstShow!.board.kind === "abacus_set" ? firstShow!.board.digits : [];
  assert.ok(
    digits.length >= 3 && digits.every((d) => typeof d === "number"),
    "the staged abacus has a real digits array",
  );
  console.log(`  PASS  placeValue4Digit stages the abacus with digits [${digits.join(", ")}]`);

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

  // 4. The 5421 introduction builds the number in front of the child: a
  //    spoken beat stages the abacus BARE, and the SHOW_BOARD beats that
  //    follow ("දහසස්ථානයේ කූරට අපි පබළු … පහක් දානවා") land beads rod by
  //    rod until every rod carries its digit — before anything re-stages
  //    the board. (This replaced the self-animating re-stage: storyboard
  //    board note B1 found it re-landing beads on rods already filled.)
  const bareIntro = script.beats.find(
    (beat) => beat.spokenText !== undefined && beat.board.kind === "abacus_set" && beat.board.startEmpty === true,
  );
  assert.ok(bareIntro && bareIntro.board.kind === "abacus_set", "a spoken beat stages the abacus bare, beads to come");
  {
    const target = bareIntro!.board.kind === "abacus_set" ? bareIntro!.board.digits : [];
    const landed = target.map(() => 0);
    let completedAt: string | undefined;
    for (let i = script.beats.indexOf(bareIntro!) + 1; i < script.beats.length; i += 1) {
      const beat = script.beats[i]!;
      if (beat.board.kind === "abacus_add_bead") {
        assert.ok(beat.type === "SHOW_BOARD" && beat.spokenText, `${beat.id}: beads land only under a spoken SHOW_BOARD`);
        for (const add of beat.board.adds ?? [{ rod: beat.board.rod, count: beat.board.count }]) {
          landed[add.rod] = (landed[add.rod] ?? 0) + add.count;
          assert.ok(landed[add.rod]! <= target[add.rod]!, `${beat.id}: rod ${add.rod} would hold ${landed[add.rod]} beads for digit ${target[add.rod]}`);
        }
        if (landed.every((n, rod) => n === target[rod])) { completedAt = beat.id; break; }
      } else if (beat.board.kind !== "none") {
        break;
      }
    }
    assert.ok(completedAt, `the bare abacus [${target.join(",")}] is never completed by bead-adds before the board changes`);
    console.log(
      `  PASS  the abacus is staged bare at ${bareIntro!.id} and the beads complete ${target.join("")} by ${completedAt} while she narrates each rod`,
    );
  }

  const abacusShows = script.beats.filter((beat) => beat.board.kind === "abacus_set" && beat.board.startEmpty);
  // Under the merged design concepts the transitional (pre-authored)
  // script may schedule zero bare-rod demos — the bead-landing rule is
  // asserted whenever one exists.
  if (abacusShows.length === 0) console.log("  note  no bare-rod abacus demo in this transitional script");
  for (const show of abacusShows) {
    if (show.board.kind !== "abacus_set") continue;
    const shown = show.board.digits.map(() => 0);
    for (let i = script.beats.indexOf(show) + 1; i < script.beats.length; i += 1) {
      const beat = script.beats[i];
      if (beat.itemId !== show.itemId || beat.segmentIndex !== show.segmentIndex) break;
      if (beat.board.kind === "abacus_add_bead") {
        for (const add of beat.board.adds ?? [{ rod: beat.board.rod, count: beat.board.count }]) shown[add.rod] += add.count;
      }
    }
    // A MODE 2 demo deliberately reveals only part before asking — every
    // landed bead must at least match its rod's digit exactly or stay short.
    show.board.digits.forEach((digit, rod) => {
      assert.ok(shown[rod] === digit || shown[rod] === 0 || shown[rod] <= digit,
        `${show.id}: rod ${rod} got ${shown[rod]} beads for digit ${digit}`);
    });
  }
  console.log(`  PASS  abacus demos land beads per reveal (${abacusShows.length} demo(s) simulated)`);

  // 6. Every design concept has a real spoken run — no concept became an
  //    empty shell in the re-map. (The tight per-concept beat bounds died
  //    with the old video-derived concept list; the authored script has
  //    its own budgets.)
  for (const concept of script.concepts) {
    const spoken = script.beats
      .slice(concept.firstBeat, concept.lastBeat + 1)
      .filter((b) => (b.type === "EXPLAIN" || b.type === "SOFT_CHECK" || b.type === "ASK") && b.spokenText);
    assert.ok(spoken.length >= 3, `${concept.conceptTag} has only ${spoken.length} spoken beats`);
  }
  console.log(`  PASS  all ${script.concepts.length} design concepts have real spoken runs`);

  // 6a. TEXTBOOK EXERCISE AUDIT — every textbook exercise/table the design
  //     assigns to a session-1 concept, and whether a beat stages it.
  const design = JSON.parse(await readFile(path.join(process.cwd(), "../docs/design/maths-5-1.json"), "utf8")) as {
    concepts: Array<{ conceptTag: string; objective?: string; textbookContent: Array<{ step: number; contentBankIds: string[]; summary: string }> }>;
  };
  console.log(`\n${"=".repeat(78)}\nTEXTBOOK EXERCISE AUDIT (design → beats)\n${"=".repeat(78)}`);
  const unstaged: string[] = [];
  for (const concept of design.concepts.filter((c) => c.conceptTag === "readWrite4Digit" || c.conceptTag === "placeValue4Digit")) {
    for (const content of concept.textbookContent) {
      for (const itemId of content.contentBankIds) {
        const stagedBy = script.beats.filter((beat) => beat.itemId === itemId).map((beat) => beat.id.replace("authored:", ""));
        const row = rows.find((r) => r.id === itemId);
        const kind = row?.component_type ?? "?";
        const status = stagedBy.length ? `staged by ${stagedBy.slice(0, 3).join(", ")}${stagedBy.length > 3 ? ` +${stagedBy.length - 3}` : ""}` : "NOT STAGED";
        if (!stagedBy.length) unstaged.push(`${concept.conceptTag} step ${content.step} (${kind} ${itemId.slice(0, 8)})`);
        console.log(`  ${concept.conceptTag.padEnd(18)} textbook step ${content.step}  ${String(kind).padEnd(18)} ${itemId.slice(0, 8)}  ${status}\n${"".padEnd(22)}${content.summary.slice(0, 110)}`);
      }
    }
  }
  // The abacus worked example (step 4) is a figure, not an exercise — the
  // design itself says its practice is omitted — so only exercises gate.
  const unstagedExercises = unstaged.filter((line) => !line.includes("AbacusDiagram"));
  assert.deepStrictEqual(unstagedExercises, [], `textbook exercises with no beat: ${unstagedExercises.join("; ")}`);
  console.log(`  PASS  every textbook exercise of the session-1 concepts is staged by a beat${unstaged.length ? ` (${unstaged.length} figure not staged: ${unstaged.join("; ")})` : ""}`);

  // 6c. Every ASK carries a teaching mode — without one the orchestrator
  //     never counts an unaided answer and no concept is ever mastered.
  const asksWithoutMode = script.beats.filter((beat) => (beat.type === "ASK" || beat.type === "CHECK_MY_WORK") && beat.id.startsWith("authored:") && beat.mode === null);
  assert.deepStrictEqual(asksWithoutMode.map((b) => b.id), [], "authored ASKs without a mode");
  const modeCounts = new Map<number, number>();
  for (const beat of script.beats) if (beat.id.startsWith("authored:") && (beat.type === "ASK" || beat.type === "CHECK_MY_WORK")) modeCounts.set(beat.mode ?? 0, (modeCounts.get(beat.mode ?? 0) ?? 0) + 1);
  console.log(`  PASS  every authored ASK has a mode (${[...modeCounts.entries()].map(([m, n]) => `mode ${m}: ${n}`).join(", ")})`);

  // 6d. Every question has an answerMode and a touch surface; every
  //     chip-dealing question has three valid options. Printed in full —
  //     the options are part of the script now.
  const questions = script.beats.filter((beat) => beat.id.startsWith("authored:") && (beat.type === "ASK" || beat.type === "CHECK_MY_WORK" || beat.type === "SOFT_CHECK"));
  const withoutMode = questions.filter((beat) => !beat.answerMode);
  assert.deepStrictEqual(withoutMode.map((b) => b.id), [], "questions without an answerMode");
  const designObjectives = new Map(design.concepts.map((c) => [c.conceptTag, c.objective ?? ""]));
  for (const beat of questions) {
    const fromObjective = conceptSkill(beat.conceptTag, designObjectives.get(beat.conceptTag));
    assert.equal(fromObjective, conceptSkill(beat.conceptTag), `${beat.id}: the design objective and the concept tag name different skills`);
  }
  const perMode = new Map<string, { asks: number; soft: number }>();
  for (const beat of questions) {
    const entry = perMode.get(beat.answerMode!) ?? { asks: 0, soft: 0 };
    if (beat.type === "SOFT_CHECK") entry.soft += 1;
    else entry.asks += 1;
    perMode.set(beat.answerMode!, entry);
  }
  console.log("\nANSWER MODES (per question, derived at build time)");
  console.log("==============================================================================");
  console.log(`  ${"mode".padEnd(14)} ${"judged ASKs".padStart(11)} ${"soft checks".padStart(11)}   touch surface`);
  for (const mode of ANSWER_MODES) {
    const entry = perMode.get(mode) ?? { asks: 0, soft: 0 };
    console.log(`  ${mode.padEnd(14)} ${String(entry.asks).padStart(11)} ${String(entry.soft).padStart(11)}   ${TOUCH_SURFACE[mode]}`);
  }
  const judged = questions.filter((b) => b.type !== "SOFT_CHECK");
  const speechPrimary = judged.filter((b) => SPEECH_PRIMARY[b.answerMode!]).length;
  const speechPrimaryAll = questions.filter((b) => SPEECH_PRIMARY[b.answerMode!]).length;
  console.log(`  speech-primary share: ${speechPrimary}/${judged.length} judged questions (${Math.round((100 * speechPrimary) / judged.length)}%) · ${speechPrimaryAll}/${questions.length} counting soft checks (${Math.round((100 * speechPrimaryAll) / questions.length)}%)`);
  assert.equal(speechPrimary, 0, "a judged question leads with speech — the answer path is touch-only");
  const practice = judged.filter((b) => READING_PRACTICE[b.answerMode!]).length;
  console.log(`  read-aloud (the chips are the question, from the first word; her read-back after a right answer): ${practice} question(s)`);
  console.log("\n  every judged question, its mode and its options:");
  const optionProblems: string[] = [];
  for (const beat of judged) {
    const mode = beat.answerMode!;
    const open = Boolean(parseAnswerPredicate(beat.expectedAnswer));
    const needsChips = mode === "why" || mode === "readAloud" || mode === "valueOrPlace";
    const set = beat.choices ?? null;
    if (set || needsChips || !open) {
      const problems = open ? [] : validateChoices(set, beat.expectedAnswer ?? "", mode === "why" && beat.rubric ? (o) => judgePhraseLocally(o, beat.rubric!).accepted : undefined);
      if (problems.length && (needsChips || set)) optionProblems.push(`${beat.id}: ${problems.join(", ")}`);
    }
    // The touch surface the mode leads with is really there.
    const surfaceOk =
      mode === "build" ? open || Boolean(set) || /^[\d\s,]+$/u.test(beat.expectedAnswer ?? "") || beat.expectedAnswer?.split(/\s+/u).every((t) => isNumberWord(t))
      : mode === "cell" ? beat.board.kind === "set_active_blank" || Boolean(set)
      : Boolean(set);
    assert.ok(surfaceOk, `${beat.id} (${mode}) has no touch surface: ${TOUCH_SURFACE[mode]}`);
    const shown = set ? set.options.map((o, i) => (i === set.correctIndex ? `[${o}]` : o)).join(" · ") : open ? "(open build: the picker, no chips)" : "(pad; chips after a miss)";
    console.log(`    ${beat.id.replace(/^authored:/u, "").padEnd(22)} ${mode.padEnd(13)} ${shown}`);
  }
  assert.deepStrictEqual(optionProblems, [], `option sets that fail the validator: ${optionProblems.join("; ")}`);
  console.log(`  PASS  every question has an answerMode and its touch surface; ${judged.filter((b) => b.choices).length} option sets pass the validator (3 distinct, exactly one correct, no relabelled answer)`);

  // 6b. The storyboard fits the script it will choreograph: every session-1
  //     authored beat has a storyboard beat and vice versa, each beat's
  //     sentences match what the clip will split into, and every event
  //     reduces onto the board (state carrying within a concept exactly as
  //     the runtime carries it).
  const storyboard = JSON.parse(
    await readFile(path.join(process.cwd(), "src/data/storyboard", "maths-5-1-session-1.json"), "utf8"),
  ) as Storyboard;
  const byId = new Map(storyboard.beats.map((beat) => [beat.id, beat]));
  const authoredInScript = script.beats.filter((beat) => beat.id.startsWith("authored:"));
  const missingFromStoryboard = authoredInScript.filter((beat) => !byId.has(beat.id)).map((beat) => beat.id);
  const missingFromScript = storyboard.beats.filter((sb) => !authoredInScript.some((beat) => beat.id === sb.id)).map((sb) => sb.id);
  assert.deepStrictEqual(missingFromStoryboard, [], `authored beats with no storyboard beat: ${missingFromStoryboard.join(", ")}`);
  assert.deepStrictEqual(missingFromScript, [], `storyboard beats not in the script: ${missingFromScript.join(", ")}`);
  for (const beat of authoredInScript) {
    const sb = byId.get(beat.id)!;
    const spoken = sentencesOf(beat.spokenText ?? "");
    assert.strictEqual(spoken.length, sb.sentences.length, `${beat.id}: the clip will split into ${spoken.length} sentence(s), the storyboard planned ${sb.sentences.length}`);
    for (const event of sb.events) {
      assert.ok(event.sentenceIndex < sb.sentences.length, `${beat.id}: event ${eventKey(event)} on sentence ${event.sentenceIndex} of ${sb.sentences.length}`);
    }
  }
  let stage = initialStage();
  const unknown: string[] = [];
  let reduced = 0;
  for (const sb of storyboard.beats) {
    for (const event of sb.events) {
      if (!isKnownEvent(event)) {
        unknown.push(`${sb.id} ${eventKey(event)}`);
        continue;
      }
      stage = reduceStage(stage, event, { lastBuilt: 1364 });
      reduced += 1;
    }
  }
  assert.deepStrictEqual(unknown, [], `storyboard events with no matching primitive: ${unknown.join(", ")}`);
  // 6d. Every sentence that names a place while the abacus is up glows
  //     the rod it names (a bead_add on that rod counts — the runtime glows
  //     the rod it fills; so does a part flying from that rod into the
  //     expansion beneath — the flight is the attention on that rod, M8).
  const darkRods: string[] = [];
  let glowStage = initialStage();
  for (const sb of storyboard.beats) {
    sb.sentences.forEach((sentence, index) => {
      const events = sb.events.filter((e) => e.sentenceIndex === index);
      const abacusUp = glowStage.base?.kind === "abacus" || events.some((e) => e.primitive === "abacus" && e.event === "show");
      if (abacusUp) {
        for (const rod of rodsNamedIn(sentence)) {
          const lit = events.some((e) => e.primitive === "expansion" && e.event === "part_fly" && Number(e.args?.fromRod) === rod) || events.some((e) => e.primitive === "abacus" && (e.event === "rod_glow" || e.event === "bead_add") && (Number(e.args?.rod) === rod || (Array.isArray(e.args?.rods) && (e.args!.rods as number[]).includes(rod))));
          if (!lit) darkRods.push(`${sb.id.replace("authored:", "")} s${index} rod ${rod}`);
        }
      }
      for (const event of events) if (isKnownEvent(event)) glowStage = reduceStage(glowStage, event, { lastBuilt: 1364 });
    });
  }
  assert.deepStrictEqual(darkRods, [], `place named while the abacus is up but its rod does not glow: ${darkRods.join("; ")}`);
  console.log(`  PASS  every place named while the abacus is up glows its rod`);
  console.log(
    `  PASS  storyboard ↔ script: ${storyboard.beats.length} beats matched, ${reduced} events reduce onto the board (ends on ${describeStage(stage).slice(0, 60)})`,
  );

  // 6e. ITEM LEDGER — the coverage gate (triage cluster C, issue 25). Every
  //     textbook item of the authored concepts, and every blank within it,
  //     is asked of the child, demonstrated by Zara, or explicitly deferred
  //     to a named later session. Zero "NOT COVERED" is the gate.
  console.log(`\n${"=".repeat(78)}\nITEM LEDGER — every textbook item and every blank (authored concepts)\n${"=".repeat(78)}`);
  const short = (id: string) => id.replace(/^authored:/u, "");
  const sessionOf = (beatIndex: number): number => script.sessions.findIndex((s) => beatIndex >= s.firstBeat && beatIndex <= s.lastBeat) + 1;
  const authoredTags = new Set<string>(authoredScript?.concepts ?? []);
  const conceptStartSession = (tag: string): number => {
    const concept = script.concepts.find((c) => c.conceptTag === tag);
    return concept ? sessionOf(concept.firstBeat) : 0;
  };
  const indexed = script.beats.map((beat, index) => ({ beat, index }));
  const boardOf = (beat: Beat) => beat.board as { kind: string; itemId?: string; rowIndex?: number; field?: string; demonstrateRow?: number };
  interface LedgerRow { item: string; blank: string; status: string; ok: boolean }
  const ledger: LedgerRow[] = [];
  const workStream = indexed.filter(({ beat }) => beat.conceptTag !== FRAMING_CONCEPT);
  const workUnits = exerciseUnits(workStream.map(({ beat }) => beat)).map((u) => ({ ...u, startIndex: workStream[u.start]!.index, endIndex: workStream[u.end]!.index }));
  const deferral = (tag: string, at: number): string => {
    const home = conceptStartSession(tag);
    return sessionOf(at) > home ? ` — deferred from session ${home} to session ${sessionOf(at)}` : "";
  };
  // The textbook's items are the design's (6a above): the bank's other rows for these concepts are the recorded teacher's own examples, worked verbally.
  const textbookIds = new Set(design.concepts.filter((c) => authoredTags.has(c.conceptTag)).flatMap((c) => c.textbookContent.flatMap((t) => t.contentBankIds)));
  for (const row of rows.filter((r) => textbookIds.has(r.id) && r.component_type !== "ExampleBox" && r.component_type !== "AbacusDiagram")) {
    const label = `${row.component_type} ${row.id.slice(0, 8)}`;
    const stages = indexed.filter(({ beat }) => beat.board.kind === "stage_item" && boardOf(beat).itemId === row.id);
    if (row.component_type === "DigitPickerPuzzle") {
      // Five builds: the picker questions of the exercise's unit.
      const unit = workUnits.find((u) => stages.some((s) => s.index === u.startIndex));
      const builds = unit ? indexed.slice(unit.startIndex, unit.endIndex + 1).filter(({ beat }) => beat.type === "ASK" && beat.board.kind === "show_components") : [];
      for (let n = 1; n <= 5; n += 1) {
        const build = builds[n - 1];
        ledger.push({ item: label, blank: `build ${n} of 5`, status: build ? `asked at ${short(build.beat.id)} (session ${sessionOf(build.index)})${deferral(row.concept_tag, build.index)}` : "NOT COVERED", ok: Boolean(build) });
      }
      continue;
    }
    // The demonstration row (staged blank for Zara to fill): every cell she writes is a demonstration.
    const demo = stages.find(({ beat }) => boardOf(beat).demonstrateRow !== undefined);
    const props = (row.component_props ?? {}) as { rows?: Array<Record<string, unknown>> };
    if (demo) {
      const demoRow = boardOf(demo.beat).demonstrateRow!;
      for (const [field, value] of Object.entries(props.rows?.[demoRow] ?? {})) {
        if (field === "number" || value === null || value === undefined) continue;
        const revealed = indexed.find(({ beat }) => beat.board.kind === "reveal_part" && boardOf(beat).itemId === row.id && boardOf(beat).rowIndex === demoRow && boardOf(beat).field === field);
        ledger.push({ item: label, blank: `row ${demoRow + 1} ${field} (worked example)`, status: revealed ? `demonstrated by Zara at ${short(revealed.beat.id)} (session ${sessionOf(revealed.index)})${deferral(row.concept_tag, revealed.index)}` : "NOT COVERED — the worked row is staged blank but never filled", ok: Boolean(revealed) });
      }
    }
    for (const blank of blanksForItem(row.component_type, row.component_props, row.answer)) {
      const asked = indexed.find(({ beat }) => beat.type === "ASK" && beat.board.kind === "set_active_blank" && boardOf(beat).itemId === row.id && boardOf(beat).rowIndex === blank.rowIndex && boardOf(beat).field === blank.field);
      const revealed = indexed.find(({ beat }) => beat.board.kind === "reveal_part" && boardOf(beat).itemId === row.id && boardOf(beat).rowIndex === blank.rowIndex && boardOf(beat).field === blank.field);
      const where = asked ?? revealed;
      const status = asked
        ? `asked at ${short(asked.beat.id)} (session ${sessionOf(asked.index)}${revealed ? ", confirmed" : ""})`
        : revealed
          ? `Zara fills it at ${short(revealed.beat.id)} (session ${sessionOf(revealed.index)})`
          : "NOT COVERED";
      ledger.push({ item: label, blank: `row ${blank.rowIndex + 1} ${blank.field}`, status: where ? status + deferral(row.concept_tag, where.index) : status, ok: Boolean(where) });
    }
  }
  // The guide's warm-up list is a text card, not a content_bank row: every number on it is read aloud (issue 6c).
  const cardRows = new Map<string, Array<{ beat: Beat; index: number }>>();
  for (const entry of indexed) {
    if (!authoredTags.has(entry.beat.conceptTag) || entry.beat.board.kind !== "text_card") continue;
    const cards = rowOfCards(entry.beat.board.text);
    if (cards && cards.length >= 3) cardRows.set(entry.beat.board.text, [...(cardRows.get(entry.beat.board.text) ?? []), entry]);
  }
  for (const [text, entries] of cardRows) {
    // A row that is READ (one of its cards is asked about with the ring on it) must be read in full; the card game's 0–9 and the chosen digits are not reading lists.
    if (!entries.some(({ beat }) => beat.type === "ASK" && beat.board.kind === "text_card" && beat.board.highlight)) continue;
    for (const value of rowOfCards(text) ?? []) {
      const asked = entries.find(({ beat }) => beat.type === "ASK" && beat.board.kind === "text_card" && beat.board.highlight === String(value));
      ledger.push({ item: `number list ${text.replace(/\s+/gu, " · ")}`, blank: String(value), status: asked ? `asked at ${short(asked.beat.id)} (read-aloud, session ${sessionOf(asked.index)})` : "NOT COVERED", ok: Boolean(asked) });
    }
  }
  let currentItem = "";
  for (const row of ledger) {
    if (row.item !== currentItem) {
      currentItem = row.item;
      console.log(`  ${currentItem}`);
    }
    console.log(`    ${row.ok ? "✓" : "✗"} ${row.blank.padEnd(34)} ${row.status}`);
  }
  const uncovered = ledger.filter((row) => !row.ok);
  console.log(`  ledger: ${ledger.length} blanks · ${ledger.filter((r) => r.status.startsWith("asked")).length} asked · ${ledger.filter((r) => /^(Zara fills|demonstrated)/u.test(r.status)).length} demonstrated · ${ledger.filter((r) => r.status.includes("deferred")).length} deferred to a named session · ${uncovered.length} NOT COVERED`);
  assert.deepStrictEqual(uncovered.map((r) => `${r.item}: ${r.blank}`), [], "textbook blanks nobody asks, demonstrates or defers");
  console.log(`  PASS  every textbook item and every blank of the authored concepts is asked, demonstrated, or deferred to a named session (0 uncovered)`);

  // 6f. EXERCISE ATOMICITY (issue 22): a staged exercise and every beat that
  //     works it are one unit — never split across sittings, its first
  //     question within 6 beats of the staging, its demonstration adjacent
  //     to its practice.
  const split = workUnits.filter((u) => sessionOf(u.startIndex) !== sessionOf(u.endIndex)).map((u) => `${short(script.beats[u.startIndex]!.id)}…${short(script.beats[u.endIndex]!.id)} (sessions ${sessionOf(u.startIndex)}→${sessionOf(u.endIndex)})`);
  assert.deepStrictEqual(split, [], `exercises cut by a session boundary: ${split.join("; ")}`);
  const lateAsks: string[] = [];
  const nonAdjacent: string[] = [];
  const unitLines: string[] = [];
  for (const unit of workUnits) {
    const beatsOf = indexed.slice(unit.startIndex, unit.endIndex + 1);
    const firstAsk = beatsOf.findIndex(({ beat }) => beat.type === "ASK");
    const asks = beatsOf.filter(({ beat }) => beat.type === "ASK").length;
    if (firstAsk === -1) continue;
    if (firstAsk > 6) lateAsks.push(`${short(beatsOf[0]!.beat.id)}: first ASK ${firstAsk} beats after the staging`);
    const demos = beatsOf.slice(0, firstAsk).map((e, k) => ({ ...e, k })).filter(({ beat }) => beat.board.kind === "reveal_part");
    if (demos.length > 0 && demos[demos.length - 1]!.k + 1 !== firstAsk) nonAdjacent.push(`${short(beatsOf[0]!.beat.id)}: the demonstration ends ${firstAsk - demos[demos.length - 1]!.k - 1} beat(s) before the practice`);
    unitLines.push(`    ${short(beatsOf[0]!.beat.id).padEnd(22)} → ${short(beatsOf[beatsOf.length - 1]!.beat.id).padEnd(22)} ${String(beatsOf.length).padStart(2)} beats · ${asks} ASK(s) · first ASK after ${firstAsk} beat(s) · ${demos.length} demonstration cell(s) · session ${sessionOf(unit.startIndex)}`);
  }
  console.log(`  exercise units (${workUnits.length}):\n${unitLines.join("\n")}`);
  assert.deepStrictEqual(lateAsks, [], `staged exercises whose first question comes late: ${lateAsks.join("; ")}`);
  assert.deepStrictEqual(nonAdjacent, [], `demonstrations not adjacent to their practice: ${nonAdjacent.join("; ")}`);
  console.log(`  PASS  no exercise spans a session boundary; every staged exercise's first ASK is within 6 beats; every demonstration is adjacent to its practice`);

  // 6h. TUTOR TURNS ANNOUNCE THEMSELVES (the device walk, issue 2). In a
  //     MODE 2 alternation a cell Zara takes must say so before it fills —
  //     otherwise an answer appears from nowhere. A confirmation of the
  //     cell the child was just asked about is not a tutor turn; a run of
  //     consecutive tutor fills announces once, at its first cell.
  const tutorFills: Array<{ id: string; cell: string; first: string; kind: string }> = [];
  const unannounced: string[] = [];
  let previousAsk: { itemId: string; rowIndex: number; field: string } | null = null;
  let runOpen = false;
  for (const beat of script.beats) {
    const board = boardOf(beat);
    if (beat.type === "ASK" && board.kind === "set_active_blank") {
      previousAsk = { itemId: board.itemId!, rowIndex: board.rowIndex!, field: board.field! };
      runOpen = false;
      continue;
    }
    const opener = sentencesOf(beat.spokenText ?? "")[0] ?? "";
    if (board.kind !== "reveal_part" || board.itemId?.startsWith("expansion:")) {
      // A SHOW_BOARD that says "watch me do this" opens her run; the reveals under it are that demonstration.
      if (announcesTutorTurn(opener)) runOpen = true;
      else if (beat.conceptTag !== FRAMING_CONCEPT && board.kind !== "none") runOpen = false;
      continue;
    }
    const confirms = previousAsk !== null && previousAsk.itemId === board.itemId && previousAsk.rowIndex === board.rowIndex && previousAsk.field === board.field;
    const first = opener;
    const announced = announcesTutorTurn(first);
    const kind = confirms ? "confirms the child's answer" : announced ? "announced" : runOpen ? "continues an announced run" : "UNANNOUNCED";
    tutorFills.push({ id: short(beat.id), cell: `row ${(board.rowIndex ?? 0) + 1} ${board.field}`, first: first.slice(0, 44), kind });
    if (kind === "UNANNOUNCED") unannounced.push(`${short(beat.id)} fills row ${(board.rowIndex ?? 0) + 1}'s ${board.field} with nothing said: "${first.slice(0, 40)}"`);
    if (announced) runOpen = true;
    previousAsk = null;
  }
  console.log(`\n${"=".repeat(78)}\nTUTOR TURNS (a cell she takes says so first)\n${"=".repeat(78)}`);
  for (const row of tutorFills) console.log(`  ${row.kind === "UNANNOUNCED" ? "✗" : "✓"} ${row.id.padEnd(22)} ${row.cell.padEnd(26)} ${row.kind.padEnd(28)} "${row.first}"`);
  assert.deepStrictEqual(unannounced, [], `tutor fills with no announcing line: ${unannounced.join("; ")}`);
  console.log(`  PASS  ${tutorFills.length} tutor fill(s): none without an announcing line before it`);

  // 6g. SAME-SENTENCE EVENTS (triage cluster E): events on one sentence fire
  //     in sequence — no two abacus gestures share a timestamp — and a text
  //     card is ringed when she says its words (opening:5, "ලොකු සංඛ්‍යා").
  const shared: string[] = [];
  for (const sb of storyboard.beats) {
    const stamps = new Set<string>();
    for (const e of sb.events) {
      if (e.primitive !== "abacus" || (e.event !== "rod_glow" && e.event !== "bead_add")) continue;
      const stamp = `s${e.sentenceIndex}@${e.at ?? 0}`;
      if (stamps.has(stamp)) shared.push(`${short(sb.id)} ${stamp}`);
      stamps.add(stamp);
    }
  }
  assert.deepStrictEqual(shared, [], `abacus gestures sharing a timestamp: ${shared.join(", ")}`);
  const opening5 = storyboard.beats.find((sb) => sb.id === "authored:opening:5");
  assert.ok(opening5?.events.some((e) => e.primitive === "highlight" && e.event === "circle" && (e.args?.target as { text?: string } | undefined)?.text === "ලොකු සංඛ්‍යා"), "opening:5 has no highlight on the ලොකු සංඛ්‍යා card");
  assert.ok(opening5?.events.some((e) => e.primitive === "pointer"), "opening:5 has no pointer on the card");
  console.log(`  PASS  no two rod_glow / bead_add events share a timestamp; opening:5 rings and points at "ලොකු සංඛ්‍යා"`);
  const timeline = (id: string): void => {
    const sb = storyboard.beats.find((b) => b.id === `authored:${id}`);
    if (!sb) return;
    console.log(`  timeline ${id}:`);
    sb.sentences.forEach((sentence, i) => {
      console.log(`    s${i} "${sentence}"`);
      const ordered = sb.events.filter((e) => e.sentenceIndex === i).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
      for (const e of ordered) console.log(`       @${(e.at ?? 0).toFixed(2)}  ${eventKey(e)}${e.args ? ` ${JSON.stringify(e.args)}` : ""}`);
    });
  };
  timeline("placeValue4Digit:36");
  timeline("placeValue4Digit:41");
  timeline("opening:5");

  // 7. Session 1's turn-taking shape: at most SESSION_ASK_LIMIT real ASK
  //    waits, zero mandatory yes/no questions, rhetoric stays inline as
  //    pause markers. The packer now enforces the same ceiling while it
  //    cuts sessions, so this asserts the two agree.
  const s1 = script.beats.slice(script.sessions[0].firstBeat, script.sessions[0].lastBeat + 1);
  const s1Asks = s1.filter((b) => b.type === "ASK");
  const s1Softs = s1.filter((b) => b.type === "SOFT_CHECK");
  const s1Rhetorical = s1.reduce((n, b) => n + (b.spokenText?.match(/\?…/gu)?.length ?? 0), 0);
  // The packer's contract, asserted exactly rather than as a fitted number:
  // a sitting may pass the 12-question ceiling only while it has no way to
  // stop. Once it is BOTH over the ceiling and past the 12-minute floor,
  // every later beat must be a non-boundary — because the packer would
  // have cut at the first boundary it saw.
  const ASK_CEILING = 12;
  const FLOOR_SECONDS = 720;
  const isCut = (type: string): boolean =>
    type === "SHOW_BOARD" || type === "EXPLAIN" || type === "HOOK" || type === "TRANSITION";

  for (const [index, session] of script.sessions.entries()) {
    // Mirror the packer's own accounting: it budgets the WORK stream only.
    // Framing (SESSION_START / RECAP / BREAK_CHAT / CLOSE_SESSION) is added
    // per slice afterwards, so counting it here would make a session look
    // past the floor while the packer still had it under.
    const slice = script.beats
      .slice(session.firstBeat, session.lastBeat + 1)
      .filter((beat) => beat.conceptTag !== FRAMING_CONCEPT);
    let asks = 0;
    let seconds = 0;
    let missed: string | null = null;
    const sliceUnits = exerciseUnits(slice);
    // The packer also refuses a cut that would leave only a stub (less than a
    // minimum sitting of work) after it — the tail joins the sitting instead.
    const laterWorkSeconds = script.beats
      .slice(session.lastBeat + 1)
      .filter((beat) => beat.conceptTag !== FRAMING_CONCEPT)
      .reduce((sum, beat) => sum + estimateBeatSeconds(beat), 0);
    for (const [k, beat] of slice.entries()) {
      const tailSeconds = laterWorkSeconds + slice.slice(k).reduce((sum, b) => sum + estimateBeatSeconds(b), 0);
      // A cut point inside a staged exercise is not a cut point (issue 22: exercises are atomic), nor is one that leaves a stub.
      if (asks >= ASK_CEILING && seconds >= FLOOR_SECONDS && isCut(beat.type) && !insideExerciseUnit(sliceUnits, k) && tailSeconds >= FLOOR_SECONDS && !missed) {
        missed = `${beat.id} (${beat.type})`;
      }
      seconds += estimateBeatSeconds(beat);
      if (beat.type === "ASK") asks += 1;
    }
    const minutes = session.estimatedSeconds / 60;
    if (asks > ASK_CEILING) {
      console.log(
        `  WARN  session ${index + 1} asks ${asks} questions in ${minutes.toFixed(1)} min ` +
          `— one every ${((minutes * 60) / asks).toFixed(0)}s, over the ${ASK_CEILING}-question ceiling.`,
      );
    }
    assert.ok(
      !missed,
      `session ${index + 1} carried ${asks} questions past the ceiling and the floor with a safe cut point ` +
        `still available at ${missed} — the packer is ignoring its own ASK budget`,
    );
  }
  for (const ask of s1Asks) {
    assert.ok(
      !/(නේද|හරිද|තේරුණාද|එහෙමද)\s*\?\s*$/u.test(ask.spokenText ?? ""),
      `ASK ${ask.id} demands a yes/no reply: ${ask.spokenText?.slice(0, 60)}`,
    );
  }
  console.log(
    `  PASS  session 1 pause types: RHETORICAL(inline)=${s1Rhetorical}, SOFT_CHECK=${s1Softs.length}, ASK=${s1Asks.length}` +
      `${s1Asks.length > 12 ? " (over the 12 ceiling — see WARN above)" : " (≤12)"}, none yes/no`,
  );

  // 8. Nothing the tutor is given to SAY contains instruction vocabulary.
  // "ඊළඟ එකට යන්න" is the imperative the live leak produced (an instruction
  // read at the child); her own "ඊළඟ එකට යමු" ("let's move on") is real
  // teacher speech and allowed — verbatim transcripts contain it.
  // "{", "kind" and "permutation" are the shape of a predicate answer's JSON
  // (the give-up reveal once spoke "kind permutation of digits…" — issue 12).
  const FORBIDDEN_IN_SPEECH = ["ඊළඟ එකට යන්න", "beat", "goal", "next", "instruction", "{", "kind", "permutation"];
  for (const b of script.beats) {
    for (const raw of [b.spokenText, ...(b.sayCandidates ?? [])]) {
      if (!raw) continue;
      // {address} is the one legitimate brace: the vocative filled at delivery.
      const text = raw.replace(/\{address\}/gu, "");
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
  //    never reaches the child: the runtime speaks CACHED CLIPS of the
  //    beat's own words, and the caption renders that clip text — director
  //    lines exist only for the log and for writing a RETEACH line.
  await assertSpeechChannel();
}

/**
 * The spoken-register rules (src/lib/speechRules.ts). They gate approval,
 * so an approved script that breaks one is a hard failure — those words
 * are already going to a child.
 */
function assertSpeechRules(authoredScript: AuthoredScriptFile | null): void {
  if (!authoredScript) return;
  const findings = checkSpeechRules(
    authoredScript.beats.map((beat) => ({
      id: beat.id,
      spokenText: beat.spokenText,
      sourceText: beat.sourceText,
      pauseType: beat.pauseType,
      type: beat.type,
      expectedAnswer: beat.expectedAnswer ?? null,
      conceptTag: beat.conceptTag,
      board: beat.boardIntent as { kind: string; text?: string; digits?: number[]; title?: string },
      numbers: beat.numbers,
    })),
  );
  assert.ok(
    findings.length === 0 || !authoredScript.approved,
    `the APPROVED authored script breaks ${findings.length} spoken-register rule(s):\n${formatSpeechFindings(findings)}`,
  );
  console.log(
    findings.length === 0
      ? `  PASS  all ${authoredScript.beats.length} authored beats pass the spoken-register rules`
      : `  WARN  ${findings.length} spoken-register hit(s) in the unapproved script:\n${formatSpeechFindings(findings)}`,
  );
}

/**
 * Which lines exist in which voice. Printed, never asserted: a
 * part-recorded lesson is the normal state while the actor works through
 * it, and a dry run that failed on it would be red for weeks.
 */
async function reportVoiceCoverage(authoredScript: AuthoredScriptFile | null): Promise<void> {
  if (!authoredScript) return;
  try {
    const coverage = await voiceCoverage(authoredScript);
    console.log(`\n  VOICE COVERAGE`);
    console.log(formatCoverage(coverage, voiceProfile()));
  } catch (error) {
    console.log(`  note  voice coverage unavailable (${String(error).slice(0, 80)})`);
  }
}

async function assertSpeechChannel(): Promise<void> {
  const runtime = await readFile(path.join(process.cwd(), "src/hooks/useLessonRuntime.ts"), "utf8");
  // Speech is playback of the beat's own words, not a model turn.
  assert.ok(/playClip\(/.test(runtime), "the runtime speaks by playing cached clips");
  assert.ok(/\/api\/hear/.test(runtime), "answers are captured by recording + /api/hear");
  assert.ok(
    !/sendTextInput\([^)]*buildDirectorLine/.test(runtime),
    "director text is never sent to a model as conversation",
  );
  // The one place a director line may be used as input is writing a line
  // that has no fixed words (RETEACH) — and that goes to the render route.
  assert.ok(
    /goal: text \? undefined : buildDirectorLine\(beat\)/.test(runtime),
    "director text is only used to WRITE a line when the beat has none",
  );
  // The screen hands the clip's text to the shell, which draws it on the caption line (design: Gemunu 20 at bottom 26).
  const screen = await readFile(path.join(process.cwd(), "src/components/LessonScreen.tsx"), "utf8");
  const shell = await readFile(path.join(process.cwd(), "src/components/SessionShell.tsx"), "utf8");
  assert.ok(/captionsOn && caption \? caption/.test(screen) && /caption=\{caption\}/.test(shell), "the caption renders the spoken clip's text");
  assert.ok(!/\{inputTranscript\}/.test(screen), "the caption never renders the child's own words");
  assert.ok(!screen.includes("[DIRECTOR]"), "no [DIRECTOR] text in the caption component");
  console.log("  PASS  speech is cached-clip playback; answers are recorded; no director text in the caption path");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
