/**
 * The simulated-student harness: runs the orchestrator + the shared
 * runtime logic (planner judging, CONFIRM resolution, reteach insertion,
 * recap construction) in text mode — no Live session, no audio — against a
 * scripted or model-driven child, and asserts on the resulting beat trace.
 *
 * This is the harness that should have caught the three live-test bugs, so
 * its assertions ARE those bugs:
 *   1. session 1 contains no RECAP beat;
 *   2. a CONFIRM answered "yes" on a correct value never leads to a
 *      "wrong" FEEDBACK;
 *   3. after any miss, no opening-EXPLAIN beat is replayed and the beat
 *      index never moves before the concept's first practice item;
 *   4. no [DIRECTOR] text appears in any child-visible output;
 *   5. every non-chat beat has a board action (staged or inherited).
 *
 *   npm run simulate:lesson                          # scripted child (default answers)
 *   npm run simulate:lesson -- --answers '["3007?","yes"]' --recap abacusRepresentation
 *   npm run simulate:lesson -- --model               # 20 flash-driven child sessions
 *   npm run simulate:lesson -- --model --sessions 5 --misconception "reads the abacus right-to-left"
 *
 * Scripted answer tokens: a literal answer ("4004"), "wrong", "silence",
 * "yes"/"no" (CONFIRM replies), and "3007?" — a correct value heard
 * doubtfully, which forces the CONFIRM path the way the live planner does.
 */
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { buildScriptFromRows, type BankRow } from "../src/lib/lessonScriptBuilder";
import { LESSON_1_NUMBERS_STEPS, LESSON_1_NUMBERS_TITLE } from "../src/data/lessons/lesson1-numbers";
import { buildRecapAskBeat, recapAskable } from "../src/lib/recapBeat";
import { answersMatch } from "../src/lib/answerCheck";
import {
  advance,
  beatSpec,
  buildConfirmBeat,
  buildDirectorLine,
  buildFeedbackBeat,
  buildReteachBeats,
  createInitialState,
  currentBeat,
  isLessonComplete,
  resolveConfirmation,
  FRAMING_CONCEPT,
  type Beat,
  type LessonScript,
  type OrchestratorState,
  type PlannerDecision,
} from "../src/lib/lessonOrchestrator";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
const MODEL_MODE = process.argv.includes("--model");
const SESSIONS = Number(arg("sessions", "20"));
const MISCONCEPTION = arg("misconception", "reads the abacus right-to-left, so 3007 becomes 7003");
const MAX_BEATS = Number(arg("beats", "60"));
const RECAP_CONCEPT = arg("recap", "");
const ANSWERS: string[] = JSON.parse(arg("answers", '["4004", "3007?", "yes", "wrong", "silence", "3007"]'));

// ---------------------------------------------------------------------------
// Trace + assertions
// ---------------------------------------------------------------------------

interface TraceEntry {
  beat: Beat;
  scripted: boolean;
  childSaid: string | null;
  decision: PlannerDecision | null;
  /** What the child would SEE/HEAR: the director instruction is NOT part of this. */
  childVisible: string[];
}

class AssertionTally {
  results = new Map<string, { pass: number; fail: number; detail?: string }>();
  check(name: string, ok: boolean, detail?: string) {
    const entry = this.results.get(name) ?? { pass: 0, fail: 0 };
    if (ok) entry.pass += 1;
    else {
      entry.fail += 1;
      entry.detail = detail ?? entry.detail;
    }
    this.results.set(name, entry);
  }
  print(): boolean {
    let allPass = true;
    for (const [name, { pass, fail, detail }] of this.results) {
      const ok = fail === 0;
      allPass = allPass && ok;
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}  (${pass} ok${fail ? `, ${fail} FAILED` : ""})`);
      if (!ok && detail) console.log(`        ${detail}`);
    }
    return allPass;
  }
}

function assertTrace(script: LessonScript, trace: TraceEntry[], tally: AssertionTally): void {
  // 1. session 1 contains no RECAP beat (scripted plan + this run's trace).
  const session1 = script.beats.slice(script.sessions[0].firstBeat, script.sessions[0].lastBeat + 1);
  tally.check("session 1 contains no RECAP beat", session1.every((b) => b.type !== "RECAP"));
  const session1Trace = trace.filter((t) => t.beat.sessionIndex <= 0 || t.beat.sessionIndex === undefined);
  tally.check(
    "first-visit run never plays a RECAP",
    session1Trace.every((t) => t.beat.type !== "RECAP"),
  );

  // 2. CONFIRM answered yes on a correct value never → wrong FEEDBACK.
  for (let i = 0; i < trace.length; i += 1) {
    const entry = trace[i];
    if (entry.beat.type !== "CONFIRM" || entry.childSaid === null) continue;
    if (!/ඔව්|ඔවු|හරි|yes/i.test(entry.childSaid)) continue;
    // Find the ask this confirm was about and the feedback that followed.
    const ask = trace
      .slice(0, i)
      .reverse()
      .find((t) => t.beat.endBy === "asking" && t.beat.expectedAnswer !== undefined);
    const feedback = trace.slice(i + 1).find((t) => t.beat.type === "FEEDBACK");
    if (!ask?.beat.expectedAnswer || !feedback) continue;
    const heard = entry.beat.goal.match(/did they say ([^?]+)\?/)?.[1]?.trim();
    if (heard && answersMatch(ask.beat.expectedAnswer, heard)) {
      tally.check(
        "CONFIRM yes on a correct value never → wrong FEEDBACK",
        !/wasn't right/.test(feedback.beat.goal),
        `confirmed "${heard}" against expected "${ask.beat.expectedAnswer}" but got: ${feedback.beat.goal.slice(0, 80)}`,
      );
    }
  }
  tally.check("CONFIRM yes on a correct value never → wrong FEEDBACK", true); // count runs with no confirms as a pass

  // 3. After any miss: no opening-EXPLAIN replay, index floor holds.
  const openingExplainIds = new Set(
    script.concepts.flatMap((c) =>
      script.beats
        .slice(c.firstBeat, Math.min(c.firstPracticeBeat, c.lastBeat + 1))
        .filter((b) => b.type === "EXPLAIN" || b.type === "HOOK")
        .map((b) => b.id),
    ),
  );
  let missSeen = false;
  for (const entry of trace) {
    if (entry.decision && !entry.decision.understood) missSeen = true;
    if (!missSeen) continue;
    tally.check(
      "after a miss, no opening EXPLAIN/HOOK beat is replayed",
      !openingExplainIds.has(entry.beat.id.replace(/:reteach-demo$/, "")) || entry.beat.type === "RETEACH",
      `replayed ${entry.beat.id} (${entry.beat.type}) after a miss`,
    );
  }
  tally.check("after a miss, no opening EXPLAIN/HOOK beat is replayed", true);

  // 4. No [DIRECTOR] text in child-visible output.
  for (const entry of trace) {
    for (const visible of entry.childVisible) {
      tally.check(
        "no [DIRECTOR] text in child-visible output",
        !visible.includes("[DIRECTOR]"),
        `leaked in: ${visible.slice(0, 80)}`,
      );
    }
  }
  tally.check("no [DIRECTOR] text in child-visible output", true);

  // 5. Every non-chat beat has board content (staged or inherited).
  let sessionIndex = -999;
  let boardHasContent = false;
  for (const entry of trace) {
    const beat = entry.beat;
    if (beat.sessionIndex !== sessionIndex && beat.sessionIndex >= 0) {
      sessionIndex = beat.sessionIndex;
      boardHasContent = false;
    }
    if (beat.board.kind === "stage_item" || beat.board.kind === "title_card") boardHasContent = true;
    const isChat = beat.type === "CHAT_OPENER" || beat.type === "BREAK_CHAT";
    if (!isChat) {
      tally.check(
        "every non-chat beat has a board action",
        boardHasContent,
        `${beat.id} (${beat.type}) ran on an empty board`,
      );
    }
  }
  tally.check("every non-chat beat has a board action", true);
}

// ---------------------------------------------------------------------------
// The simulated runtime — same shared logic the live hook uses
// ---------------------------------------------------------------------------

type ChildBrain = (beat: Beat, expected: string | undefined) => Promise<string> | string;

/** The index-floor invariant, checked live on every transition. */
function checkFloor(script: LessonScript, before: OrchestratorState, after: OrchestratorState, tally: AssertionTally) {
  const beat = script.beats[after.beatIndex];
  if (!beat || beat.conceptTag === FRAMING_CONCEPT) return;
  const summary = script.concepts.find((c) => c.conceptTag === beat.conceptTag);
  if (!summary) return;
  if (before.conceptTag === beat.conceptTag && after.beatIndex < before.beatIndex) {
    tally.check(
      "the beat index never moves before the concept's first practice item",
      after.beatIndex >= summary.firstPracticeBeat,
      `moved to ${after.beatIndex}, floor is ${summary.firstPracticeBeat}`,
    );
  }
}

async function simulate(
  script: LessonScript,
  childBrain: ChildBrain,
  tally: AssertionTally,
  options: { recapBeats?: Beat[]; verbose?: boolean } = {},
): Promise<TraceEntry[]> {
  let state = createInitialState();
  const queue: Beat[] = [...(options.recapBeats ?? [])];
  const trace: TraceEntry[] = [];
  const usedAngles: string[] = [];
  let confirmPending: { askBeat: Beat; heard: string; scripted: boolean } | null = null;
  let spoken = 0;

  const log = (...parts: unknown[]) => options.verbose && console.log(...parts);

  while (spoken < MAX_BEATS && !isLessonComplete(script, state)) {
    const scripted = queue.length === 0;
    const beat = scripted ? currentBeat(script, state) : queue.shift()!;
    if (!beat) break;
    spoken += 1;

    const director = buildDirectorLine(beat);
    // What the child sees/hears in the simulation: the board description
    // and (stand-in for speech) the beat goal — NEVER the director line.
    const entry: TraceEntry = {
      beat,
      scripted,
      childSaid: null,
      decision: null,
      childVisible: [beat.boardDescription, beat.goal],
    };
    trace.push(entry);
    log(
      `[${String(spoken).padStart(2)}] ${beat.type.padEnd(12)} ${(beat.conceptTag || "—").padEnd(22)} ` +
        `${beat.expectedAnswer ? `expects=${beat.expectedAnswer} ` : ""}${scripted ? "" : "(inserted)"}`,
    );
    void director; // built to mirror the live path; intentionally not child-visible

    const handling = beatSpec(beat.type).onChildResponse;

    // Scripted beats that expect no judged answer just move the lesson on
    // (the live runtime does this when the model calls next_beat after
    // speaking them). Inserted beats never move the script.
    if (handling !== "judge" && beat.type !== "CONFIRM") {
      if (scripted) {
        const before = state;
        state = advance(script, state, null).state;
        checkFloor(script, before, state, tally);
      }
      continue;
    }

    // CONFIRM resolution — the shared pure resolver, exactly as live.
    if (beat.type === "CONFIRM" && confirmPending) {
      const said = String(await childBrain(beat, undefined));
      entry.childSaid = said;
      log(`     CHILD: "${said}"`);
      const reply = /ඔව්|ඔවු|හරි|yes/i.test(said) ? "yes" : /නෑ|නැහැ|no/i.test(said) ? "no" : "other";
      const outcome = resolveConfirmation(confirmPending.askBeat, confirmPending.heard, reply, answersMatch);
      const pending = confirmPending;
      confirmPending = null;
      if (outcome.kind === "judged") {
        entry.decision = outcome.decision;
        log(`     RESOLVED: understood=${outcome.decision.understood} — ${outcome.decision.reason}`);
        queue.unshift(buildFeedbackBeat(pending.askBeat, outcome.decision.understood, pending.askBeat.expectedAnswer));
        if (pending.scripted) {
          const before = state;
          const result = advance(script, state, outcome.decision);
          state = result.state;
          checkFloor(script, before, state, tally);
        }
      } else if (outcome.kind === "reask") {
        queue.unshift(pending.askBeat);
      }
      continue;
    }

    // A question for the child.
    const raw = String(await childBrain(beat, beat.expectedAnswer));
    const doubtful = raw.endsWith("?");
    const said = doubtful ? raw.slice(0, -1) : raw;
    entry.childSaid = said || "(silence)";
    log(`     CHILD: ${said ? `"${said}"${doubtful ? " (doubtful hearing)" : ""}` : "(silence)"}`);

    // The offline planner — deterministic stage, plus the doubtful-hearing
    // signal the live model stage produces.
    let decision: PlannerDecision;
    if (doubtful) {
      decision = { understood: false, next: "another_example", ambiguousNumber: said, reason: "Doubtful hearing." };
    } else if (!said || said === "silence") {
      decision = { understood: false, next: "simplify", reason: "No answer given." };
    } else if (beat.expectedAnswer && answersMatch(beat.expectedAnswer, said === "wrong" ? "දාහක්" : said)) {
      decision = { understood: true, next: "advance", reason: "Exact match." };
    } else {
      decision = { understood: false, next: "another_example", reason: "Did not match (offline planner)." };
    }

    if (decision.ambiguousNumber) {
      confirmPending = { askBeat: beat, heard: decision.ambiguousNumber, scripted };
      queue.unshift(buildConfirmBeat(beat, decision.ambiguousNumber));
      log(`     -> CONFIRM inserted for "${decision.ambiguousNumber}"`);
      continue;
    }

    entry.decision = decision;
    log(`     PLANNER: understood=${decision.understood} next=${decision.next}`);

    if (!scripted) {
      queue.unshift(buildFeedbackBeat(beat, decision.understood, beat.expectedAnswer));
      continue;
    }

    const before = state;
    const result = advance(script, state, decision);
    state = result.state;
    checkFloor(script, before, state, tally);
    queue.unshift(buildFeedbackBeat(beat, decision.understood, beat.expectedAnswer, { reteachFollows: result.needsReteach }));
    if (result.needsReteach) {
      const { beats, angleUsed } = buildReteachBeats(script, beat, usedAngles);
      if (angleUsed) usedAngles.push(angleUsed);
      queue.push(...beats);
      log(`     -> RETEACH inserted (${beats.length} beats, angle: ${angleUsed?.slice(0, 40) ?? "generic"})`);
    }
  }

  return trace;
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

function scriptedChild(answers: string[]): ChildBrain {
  let cursor = 0;
  return (beat, expected) => {
    const token = answers[cursor % answers.length];
    cursor += 1;
    if (token === "silence") return "";
    if (token === "wrong") return "දාහක්";
    if (token === "correct") return expected ?? "";
    if (token.endsWith("?")) return token; // doubtful hearing marker, handled by the sim
    return token;
  };
}

function modelChild(ai: GoogleGenAI, misconception: string): ChildBrain {
  return async (beat, expected) => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  `You are roleplaying a 10-year-old Sinhala-speaking child in a maths lesson. ` +
                  `You have this misconception: ${misconception}. Sometimes it makes your answers wrong; ` +
                  `apply it when it applies, otherwise answer correctly and briefly.\n` +
                  `The board shows: ${beat.boardDescription}\n` +
                  `The tutor asked (internal note, answer the QUESTION it implies): ${beat.goal}\n` +
                  (expected ? `(The actually-correct answer, which you may or may not reach: ${expected})\n` : "") +
                  `Reply with ONLY what the child says — one short utterance, digits or simple Sinhala.`,
              },
            ],
          },
        ],
        config: { maxOutputTokens: 2048 },
      });
      return (response.text ?? "").trim().slice(0, 80) || "මට තේරෙන්නේ නෑ";
    } catch {
      return "මට තේරෙන්නේ නෑ";
    }
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { data, error } = await supabaseAdmin
    .from("content_bank")
    .select("id, concept_tag, difficulty, component_type, component_props, answer, explanation, source")
    .eq("subject", "maths")
    .eq("grade", 5)
    .eq("lesson", 1)
    .eq("verified", true);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as BankRow[];
  const descriptions = new Map(LESSON_1_NUMBERS_STEPS.map((s) => [s.conceptTag, s.conceptDescription]));
  const script = buildScriptFromRows(rows, descriptions, "maths", 5, 1, { lessonTitle: LESSON_1_NUMBERS_TITLE });

  // Optional: put a REAL recap ASK (built by the same shared code as
  // /api/recap) at the front, to reproduce the returning-child sequences.
  let recapBeats: Beat[] = [];
  if (RECAP_CONCEPT) {
    const candidates = rows
      .filter((row) => row.concept_tag === RECAP_CONCEPT && row.component_type !== "explanation")
      .map((row) => recapAskable(row))
      .filter((a): a is NonNullable<typeof a> => a !== null);
    // Deterministic pick for reproducibility: the 3007 item when present.
    const preferred =
      candidates.find((c) => c.solution === "3007" || c.blank?.value === "3007") ?? candidates[0];
    if (preferred) recapBeats = [buildRecapAskBeat(preferred)];
    console.log(
      `Recap under test: ${recapBeats[0]?.id ?? "(none found)"} expects=${recapBeats[0]?.expectedAnswer ?? "-"}`,
    );
  }

  if (!MODEL_MODE) {
    console.log(`\nSCRIPTED CHILD — answers: ${JSON.stringify(ANSWERS)}\n`);
    const tally = new AssertionTally();
    const trace = await simulate(script, scriptedChild(ANSWERS), tally, { recapBeats, verbose: true });
    assertTrace(script, trace, tally);
    console.log(`\n${"=".repeat(78)}\nASSERTIONS (${trace.length} beats traced)\n${"=".repeat(78)}`);
    const ok = tally.print();
    process.exit(ok ? 0 : 1);
  }

  // Model-driven mode.
  const env = Object.fromEntries(
    fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY });
  console.log(`\nMODEL-DRIVEN CHILD — ${SESSIONS} sessions, misconception: "${MISCONCEPTION}"\n`);
  const tally = new AssertionTally();
  for (let sessionIndex = 0; sessionIndex < SESSIONS; sessionIndex += 1) {
    const trace = await simulate(script, modelChild(ai, MISCONCEPTION), tally, { recapBeats });
    assertTrace(script, trace, tally);
    const judged = trace.filter((t) => t.decision !== null);
    console.log(
      `  session ${String(sessionIndex + 1).padStart(2)}: ${trace.length} beats, ` +
        `${judged.filter((t) => t.decision!.understood).length}/${judged.length} answered correctly`,
    );
  }
  console.log(`\n${"=".repeat(78)}\nASSERTIONS across ${SESSIONS} sessions\n${"=".repeat(78)}`);
  const ok = tally.print();
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
