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
import { parseAuthoredScript, type AuthoredScriptFile } from "../src/lib/authoredScript";
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
  const firstShow = script.beats
    .slice(abacusConcept!.firstBeat, abacusConcept!.lastBeat + 1)
    .find((beat) => beat.type === "SHOW_BOARD" && beat.board.kind === "abacus_set");
  assert.ok(
    firstShow && firstShow.board.kind === "abacus_set",
    "placeValue4Digit must contain a SHOW_BOARD staging the animated abacus",
  );
  const digits = firstShow!.board.kind === "abacus_set" ? firstShow!.board.digits : [];
  assert.ok(
    digits.length >= 3 && digits.every((d) => typeof d === "number"),
    "the staged abacus has a real digits array",
  );
  console.log(`  PASS  placeValue4Digit stages the animated abacus with digits [${digits.join(", ")}]`);

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
  // (Was pinned to her 5421 demo; since the design re-map the merged
  // concepts choose their own explain segments, so the invariant is the
  // GENERAL one: somewhere, a spoken beat drives a self-animating abacus.)
  // SHOW_BOARD is the authored script's own way of narrating a board move
  // ("දහසස්ථානයේ කූරට අපි පබළු පහක් දානවා") — it carries spokenText like any
  // other spoken beat, and it is what stages the animated abacus now that
  // the authored script is approved.
  const animatedIntro = script.beats.find(
    (beat) =>
      (beat.type === "EXPLAIN" || beat.type === "SOFT_CHECK" || beat.type === "SHOW_BOARD") &&
      beat.spokenText !== undefined &&
      beat.board.kind === "abacus_set" &&
      beat.board.animate === true,
  );
  assert.ok(animatedIntro, "a spoken beat stages a self-animating abacus_set");
  console.log(
    `  PASS  a spoken beat stages the self-animating abacus while she says: "${animatedIntro!.spokenText!.slice(0, 60)}…"`,
  );

  // 5. Abacus item demos: beads land per reveal and finish the number.
  const abacusShows = script.beats.filter(
    (beat) => beat.type === "SHOW_BOARD" && beat.board.kind === "abacus_set" && beat.board.startEmpty,
  );
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
    for (const beat of slice) {
      if (asks >= ASK_CEILING && seconds >= FLOOR_SECONDS && isCut(beat.type) && !missed) {
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
  const screen = await readFile(path.join(process.cwd(), "src/components/LessonScreen.tsx"), "utf8");
  assert.ok(/\{caption\}/.test(screen), "the caption renders the spoken clip's text");
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
