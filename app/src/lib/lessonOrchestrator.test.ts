import { test } from "node:test";
import assert from "node:assert/strict";
import { answersMatch } from "./answerCheck";
import {
  advance,
  buildConfirmBeat,
  buildHookPraiseBeat,
  buildReteachBeats,
  resolveConfirmation,
  buildDirectorLine,
  buildFeedbackBeat,
  buildWaitBeat,
  createInitialState,
  currentBeat,
  isLessonComplete,
  sessionForBeat,
  FRAMING_CONCEPT,
  UNAIDED_CORRECT_TO_ADVANCE,
  type Beat,
  type BeatType,
  type LessonScript,
  type OrchestratorState,
  type TeachingMode,
} from "./lessonOrchestrator";
import { RETEACH_LINES } from "./authoredLines";
import { BEAT_REGISTRY, estimateSeconds } from "./beatRegistry";

/**
 * The pacing rules the old system prompt only asked for — two unaided
 * correct answers before moving on, never advancing on a wrong answer,
 * dropping back rather than repeating, breaks and closes that mastery can't
 * skip — now live in advance() and the registry. These pin them.
 */

let uid = 0;
function beat(
  over: Partial<Beat> & { type: BeatType; segmentIndex: number; mode: TeachingMode | null; conceptTag?: string },
): Beat {
  uid += 1;
  return {
    id: `${over.type}-${uid}`,
    conceptTag: "testConcept",
    sessionIndex: 0,
    itemId: "item-1",
    goal: "do the thing",
    maxSentences: 2,
    boardDescription: "a table",
    board: { kind: "none" },
    endBy: "pausing",
    ...over,
  } as Beat;
}

/** A script from a flat beat list, with concept summaries and one session derived. */
function scriptOf(beats: Beat[]): LessonScript {
  const tags = [...new Set(beats.map((b) => b.conceptTag).filter((t) => t !== FRAMING_CONCEPT))];
  return {
    subject: "maths",
    grade: 5,
    lesson: 1,
    beats,
    sessions: [
      {
        index: 0,
        firstBeat: 0,
        lastBeat: beats.length - 1,
        estimatedSeconds: estimateSeconds(beats),
        conceptTags: tags,
      },
    ],
    concepts: tags.map((conceptTag) => {
      const indices = beats.map((b, i) => (b.conceptTag === conceptTag ? i : -1)).filter((i) => i !== -1);
      const firstShow = indices.find((i) => beats[i].type === "SHOW_BOARD");
      return {
        conceptTag,
        description: null,
        firstBeat: indices[0],
        lastBeat: indices[indices.length - 1],
        firstPracticeBeat: firstShow ?? indices[0],
        reteachAngles: ["think of ten-ten bundles", "count the beads out loud one rod at a time"],
      };
    }),
    blueprint: { derivedFrom: "test", concepts: [] },
  };
}

const askMode3 = (conceptTag = "testConcept") =>
  beat({ type: "ASK", segmentIndex: 2, mode: 3, conceptTag, endBy: "asking", expectedAnswer: "42" });

function atBeat(script: LessonScript, index: number): OrchestratorState {
  const state = createInitialState(index);
  const b = script.beats[index];
  return { ...state, conceptTag: b?.conceptTag ?? FRAMING_CONCEPT, mode: (b?.mode ?? 1) as TeachingMode };
}

test("a plain beat just moves to the next one", () => {
  const script = scriptOf([beat({ type: "EXPLAIN", segmentIndex: -1, mode: null }), beat({ type: "SHOW_BOARD", segmentIndex: 0, mode: 1 })]);
  const { state, movedConcept } = advance(script, atBeat(script, 0), null);
  assert.equal(state.beatIndex, 1);
  assert.equal(movedConcept, false);
});

test("two unaided MODE 3 correct answers finish the concept", () => {
  const script = scriptOf([
    askMode3(),
    askMode3(),
    beat({ type: "SOFT_CHECK", segmentIndex: 2, mode: 3 }),
    beat({ type: "EXPLAIN", segmentIndex: -1, mode: null, conceptTag: "nextConcept" }),
  ]);
  let state = atBeat(script, 0);

  const first = advance(script, state, { understood: true, next: "advance" });
  state = first.state;
  assert.equal(state.unaidedCorrect, 1, "first correct counts");
  assert.equal(first.movedConcept, false, "one correct answer is not enough");

  const second = advance(script, state, { understood: true, next: "advance" });
  assert.equal(second.movedConcept, true, "two unaided correct advances the concept");
  assert.equal(script.beats[second.state.beatIndex].conceptTag, "nextConcept");
  assert.equal(second.state.mode, 1, "a new concept restarts at MODE 1");
  assert.equal(second.state.unaidedCorrect, 0, "counter resets for the new concept");
});

test("mastery skips leftover practice but never a break or session close", () => {
  const script = scriptOf([
    askMode3(),
    askMode3(),
    askMode3(), // leftover practice that mastery should skip
    beat({ type: "BREAK_CHAT", segmentIndex: -1, mode: null, conceptTag: FRAMING_CONCEPT, itemId: null }),
    beat({ type: "EXPLAIN", segmentIndex: -1, mode: null, conceptTag: "nextConcept" }),
  ]);
  let state = atBeat(script, 0);
  state = advance(script, state, { understood: true, next: "advance" }).state;
  const done = advance(script, state, { understood: true, next: "advance" });
  assert.equal(done.movedConcept, true);
  assert.equal(script.beats[done.state.beatIndex].type, "BREAK_CHAT", "lands on the break, not past it");
});

test("correct answers in MODE 1 and 2 do not count as unaided", () => {
  for (const mode of [1, 2] as TeachingMode[]) {
    const ask = beat({ type: "ASK", segmentIndex: 0, mode, endBy: "asking", expectedAnswer: "42" });
    const script = scriptOf([ask, beat({ type: "SOFT_CHECK", segmentIndex: 0, mode })]);
    const { state } = advance(script, { ...atBeat(script, 0), mode }, { understood: true, next: "advance" });
    assert.equal(state.unaidedCorrect, 0, `MODE ${mode} answers are assisted, so they don't count`);
  }
});

test("a wrong answer never advances the concept, and counts a miss", () => {
  const script = scriptOf([askMode3(), beat({ type: "SOFT_CHECK", segmentIndex: 2, mode: 3 })]);
  const { state, movedConcept } = advance(
    script,
    { ...atBeat(script, 0), unaidedCorrect: UNAIDED_CORRECT_TO_ADVANCE - 1 },
    { understood: false, next: "another_example" },
  );
  assert.equal(movedConcept, false);
  assert.equal(state.recentMisses, 1);
  assert.equal(state.unaidedCorrect, UNAIDED_CORRECT_TO_ADVANCE - 1, "a miss doesn't credit progress");
});

test("another_example jumps to the next item's segment at the same mode", () => {
  const script = scriptOf([
    beat({ type: "SHOW_BOARD", segmentIndex: 0, mode: 3 }),
    beat({ type: "ASK", segmentIndex: 0, mode: 3, endBy: "asking", expectedAnswer: "42" }),
    beat({ type: "SHOW_BOARD", segmentIndex: 1, mode: 3, itemId: "item-2" }),
    beat({ type: "ASK", segmentIndex: 1, mode: 3, endBy: "asking", expectedAnswer: "7" }),
  ]);
  const { state } = advance(script, atBeat(script, 1), { understood: false, next: "another_example" });
  assert.equal(state.beatIndex, 2, "lands on the next item's SHOW_BOARD");
  assert.equal(state.currentItemId, "item-2");
});

test("a second consecutive miss escalates into a reteach — never back into the explain run", () => {
  const script = scriptOf([
    beat({ type: "EXPLAIN", segmentIndex: -1, mode: null }),
    beat({ type: "SHOW_BOARD", segmentIndex: 0, mode: 1 }),
    beat({ type: "REVEAL_PART", segmentIndex: 0, mode: 1 }),
    beat({ type: "SHOW_BOARD", segmentIndex: 1, mode: 3, itemId: "item-2" }),
    beat({ type: "ASK", segmentIndex: 1, mode: 3, itemId: "item-2", endBy: "asking", expectedAnswer: "42" }),
  ]);
  const { state, needsReteach } = advance(
    script,
    { ...atBeat(script, 4), recentMisses: 1 },
    { understood: false, next: "another_example" },
  );
  assert.equal(needsReteach, true, "signals the caller to insert the reteach sequence");
  assert.equal(state.beatIndex, 3, "rewinds to the MISSED item's SHOW_BOARD, not the explanation");
  assert.ok(
    state.beatIndex >= script.concepts[0].firstPracticeBeat,
    "a miss never moves the lesson before the concept's first practice item",
  );
});

test("reteach builds a targeted sub-skill beat on an unused angle plus a fresh demo", () => {
  const script = scriptOf([
    beat({ type: "SHOW_BOARD", segmentIndex: 0, mode: 1, itemId: "demo-item" }),
    beat({ type: "REVEAL_PART", segmentIndex: 0, mode: 1, itemId: "demo-item" }),
    beat({ type: "SOFT_CHECK", segmentIndex: 0, mode: 1, itemId: "demo-item" }),
    beat({ type: "SHOW_BOARD", segmentIndex: 1, mode: 3, itemId: "missed-item" }),
    beat({
      type: "ASK",
      segmentIndex: 1,
      mode: 3,
      itemId: "missed-item",
      endBy: "asking",
      expectedAnswer: "3000",
      goal: "Ask the child for the place value for 3007. Ask only this one thing.",
    }),
  ]);
  const missedAsk = script.beats[4];

  const first = buildReteachBeats(script, missedAsk, []);
  assert.equal(first.beats[0].type, "RETEACH");
  assert.equal(first.beats[0].maxSentences, 3);
  assert.match(first.beats[0].goal, /the place value for 3007/, "targets the missed sub-skill");
  assert.equal(first.angleUsed, "think of ten-ten bundles", "takes an angle not yet used");
  assert.match(first.beats[0].goal, /ten-ten bundles/);
  const demoBeats = first.beats.slice(1);
  assert.ok(demoBeats.length > 0, "a fresh MODE 1 demo follows");
  assert.ok(demoBeats.every((b) => b.itemId === "demo-item"), "the demo uses a DIFFERENT item");
  assert.ok(demoBeats.every((b) => b.type === "SHOW_BOARD" || b.type === "REVEAL_PART"), "the inserted demo is show+reveal only");
  assert.ok(demoBeats.every((b) => b.type !== "EXPLAIN"), "no opening explanation is replayed");

  const second = buildReteachBeats(script, missedAsk, [first.angleUsed!]);
  assert.equal(second.angleUsed, "count the beads out loud one rod at a time", "the next reteach takes a DIFFERENT angle");
});

test("the reteach speaks its concept's own line, never the missed question's words", () => {
  const script = scriptOf([
    beat({ type: "SHOW_BOARD", segmentIndex: 0, mode: 1, itemId: "demo-item", conceptTag: "placeValue4Digit" }),
    beat({ type: "REVEAL_PART", segmentIndex: 0, mode: 1, itemId: "demo-item", conceptTag: "placeValue4Digit" }),
    beat({
      type: "ASK",
      segmentIndex: 1,
      mode: 3,
      itemId: "missed-item",
      conceptTag: "placeValue4Digit",
      endBy: "asking",
      expectedAnswer: "3000",
      spokenText: "මේ හිස්තැනට එන්නේ මොකක්ද කියන්න බලන්න.",
      goal: "Ask the child for the place value for 3007. Ask only this one thing.",
    }),
  ]);
  const missedAsk = script.beats[2]!;
  const reteach = buildReteachBeats(script, missedAsk, []).beats[0]!;

  // Silence was the bug this line closed: the writer is off, so a RETEACH with
  // no words of its own says nothing at all between the miss and the demo.
  assert.equal(reteach.spokenText, RETEACH_LINES.placeValue4Digit);
  assert.notEqual(reteach.spokenText, missedAsk.spokenText, "never the missed question read back at her");
  assert.equal(reteach.sayCandidates, undefined, "one line, not a choice of them");
});

test("a concept with no authored reteach line is silent, not written by a model", () => {
  const script = scriptOf([
    beat({ type: "SHOW_BOARD", segmentIndex: 0, mode: 1, itemId: "demo-item" }),
    beat({ type: "ASK", segmentIndex: 1, mode: 3, itemId: "missed-item", endBy: "asking", expectedAnswer: "7", spokenText: "කීයද?" }),
  ]);
  // "testConcept" is in no design file, so it has no line — the beat must fall
  // back to saying nothing rather than to /api/speak-line (src/lib/paidCalls.ts).
  const reteach = buildReteachBeats(script, script.beats[1]!, []).beats[0]!;
  assert.equal(reteach.spokenText, undefined);
});

test("REGRESSION (live bug): a CONFIRM answered yes on a correct value is judged correct", () => {
  // Recap ASK on abacus 3007 → child says 3007 → CONFIRM "3007 නේද?" →
  // "yes" → this once produced FEEDBACK "wrong", because the expected
  // answer was the compound display string "3007 - තුන්දහස් හත".
  const recapAsk = beat({
    type: "ASK",
    segmentIndex: -1,
    mode: 3,
    conceptTag: "abacusRepresentation",
    itemId: "recap-item",
    endBy: "asking",
    expectedAnswer: "3007",
  });
  const outcome = resolveConfirmation(recapAsk, "3007", "yes", answersMatch);
  assert.equal(outcome.kind, "judged");
  assert.equal(outcome.kind === "judged" && outcome.decision.understood, true, "confirmed correct value judged CORRECT");

  // "no" re-asks without judging; a restated answer is judged fresh.
  assert.equal(resolveConfirmation(recapAsk, "3007", "no", answersMatch).kind, "reask");
  assert.equal(resolveConfirmation(recapAsk, "3007", "other", answersMatch).kind, "fresh-answer");

  // And the wrong-number case still comes out wrong.
  const wrong = resolveConfirmation(recapAsk, "3070", "yes", answersMatch);
  assert.equal(wrong.kind === "judged" && wrong.decision.understood, false);
});

test("simplify drops back to an easier mode's segment and never replays the intro", () => {
  const script = scriptOf([
    beat({ type: "EXPLAIN", segmentIndex: -1, mode: null }),
    beat({ type: "SHOW_BOARD", segmentIndex: 0, mode: 2, itemId: "easy" }),
    beat({ type: "SHOW_BOARD", segmentIndex: 1, mode: 3, itemId: "hard" }),
    beat({ type: "ASK", segmentIndex: 1, mode: 3, endBy: "asking", expectedAnswer: "42" }),
  ]);
  const { state } = advance(script, atBeat(script, 3), { understood: false, next: "simplify" });
  assert.equal(state.currentItemId, "easy");
  assert.equal(state.mode, 2);
  assert.ok(state.beatIndex >= script.concepts[0].firstPracticeBeat, "simplify never rewinds past the first practice item");
});

test("the lesson reports complete past the last beat", () => {
  const script = scriptOf([beat({ type: "TRANSITION", segmentIndex: -1, mode: null })]);
  const { state } = advance(script, atBeat(script, 0), null);
  assert.equal(isLessonComplete(script, state), true);
  assert.equal(currentBeat(script, state), null);
});

test("session boundaries are stored and resolvable per beat", () => {
  const script = scriptOf([askMode3(), beat({ type: "CLOSE_SESSION", segmentIndex: -1, mode: null, conceptTag: FRAMING_CONCEPT })]);
  assert.equal(sessionForBeat(script, 1)?.index, 0);
  assert.equal(sessionForBeat(script, 99), null);
});

test("the director line carries the board, the goal, the limit and the yield", () => {
  const line = buildDirectorLine(
    beat({
      type: "ASK",
      segmentIndex: 0,
      mode: 3,
      endBy: "asking",
      goal: "Ask for the tens digit.",
      maxSentences: 1,
      boardDescription: "a place-value table",
      referenceWording: "මේ දහයේ ස්ථානය",
    }),
  );
  assert.match(line, /^\[DIRECTOR\] /);
  assert.match(line, /Board shows: a place-value table\./);
  assert.match(line, /Goal: Ask for the tens digit\./);
  assert.match(line, /Speak at most 1 sentence, slowly, in Sinhala\./);
  assert.match(line, /Reference wording: මේ දහයේ ස්ථානය/);
  assert.match(line, /End by asking the child the question above\. Then stop\.$/);
});

test("chat beats use their registry director text, free of lesson mechanics", () => {
  const opener = buildDirectorLine(
    beat({ type: "CHAT_OPENER", segmentIndex: -1, mode: null, conceptTag: FRAMING_CONCEPT, goal: "Ask about their day." }),
  );
  assert.match(opener, /^\[DIRECTOR\] /);
  assert.match(opener, /No lesson content yet/);
  assert.doesNotMatch(opener, /Board shows/);
});

test("the session close names something specific from this sitting", () => {
  const line = buildDirectorLine(
    beat({ type: "CLOSE_SESSION", segmentIndex: -1, mode: null, conceptTag: FRAMING_CONCEPT, goal: "Next time: abacus." }),
    { sessionSummary: { conceptsWorked: ["numberExpansion"], correctAnswers: 3, totalAsked: 4 } },
  );
  assert.match(line, /3 of 4 questions right/);
  assert.match(line, /numberExpansion/);
  assert.match(line, /Next time: abacus\./);
});

test("the wait beat is exact words that neither repeat the question nor give the answer", () => {
  const asked = askMode3();
  const wait = buildWaitBeat(asked);
  assert.equal(wait.type, "WAIT");
  assert.equal(wait.board.kind, "none", "a check-in must not disturb the board");
  assert.ok(wait.spokenText, "WAIT speaks exact words");
  assert.ok(!wait.spokenText!.includes(asked.goal), "never repeats the question");
  assert.ok(!wait.spokenText!.includes("42"), "never gives the answer");
});

test("the confirm beat repeats the doubtful number without judging it", () => {
  const confirm = buildConfirmBeat(askMode3(), "2311");
  assert.equal(confirm.type, "CONFIRM");
  assert.match(confirm.goal, /2311 නේද/);
  assert.match(confirm.goal, /Do not say whether it is right or wrong/);
  assert.equal(confirm.expectedAnswer, undefined, "the confirm itself is never judged against the answer");
});

test("the hook praise beat is the exact configured line; the hook itself is her/your words verbatim", () => {
  const hook = beat({ type: "HOOK", segmentIndex: -1, mode: null, conceptTag: "abacusRepresentation" });
  hook.spokenText = "…දහසේ කොළයක්, සීයේ කොළයක්… මුළු සල්ලි කීයද?";
  hook.expectedAnswer = "1111";
  hook.praiseText = "හරි! දහසේ එකක්, සීයේ එකක්, දහයේ එකක්, එකේ එකක් — ඒක තමයි අද අපි ඉගෙන ගන්න යන්නේ.";
  const praise = buildHookPraiseBeat(hook);
  assert.equal(praise.spokenText, hook.praiseText, "praise is the exact configured sentence");
  assert.equal(praise.expectedAnswer, undefined, "the praise beat is never judged");
  assert.equal(praise.endBy, "pausing");
  // The doorway rule itself: only an exact match earns praise.
  assert.ok(answersMatch("1111", "1111"));
  assert.ok(answersMatch("1111", "1 111"), "spacing never counts against the child");
  assert.ok(!answersMatch("1111", "111"));
});

test("feedback hands the model two exact candidate sentences, never an abstract goal", () => {
  const wrong = buildFeedbackBeat(askMode3(), false, "42");
  assert.equal(wrong.sayCandidates?.length, 2, "two candidates to choose between");
  assert.ok(wrong.sayCandidates!.every((c) => !c.includes("42")), "candidates never give the answer");
  assert.equal(wrong.endBy, "asking");

  const right = buildFeedbackBeat(askMode3(), true);
  assert.equal(right.sayCandidates?.length, 2);
  assert.equal(right.endBy, "pausing");

  const beforeReteach = buildFeedbackBeat(askMode3(), false, "42", { reteachFollows: true });
  assert.equal(beforeReteach.sayCandidates?.length, 2);
  assert.equal(beforeReteach.endBy, "pausing", "no dangling question when a reteach follows");
});

test("buildDirectorResult: say for exact words, say_one_of for feedback, instruction otherwise", async () => {
  const { buildDirectorResult } = await import("./lessonOrchestrator");
  const spoken = beat({ type: "EXPLAIN", segmentIndex: -1, mode: null });
  spoken.spokenText = "බලන්න පුතේ, මේ ගණක රාමුව.";
  assert.deepEqual(
    (buildDirectorResult(spoken) as { say_exactly: string }).say_exactly,
    "බලන්න පුතේ, මේ ගණක රාමුව.",
  );
  const feedback = buildFeedbackBeat(askMode3(), true);
  assert.ok(Array.isArray((buildDirectorResult(feedback) as { say_exactly_one_of: string[] }).say_exactly_one_of));
  const free = askMode3();
  assert.ok(typeof (buildDirectorResult(free) as { instruction: string }).instruction === "string");
});

test("every beat type has a registry entry with an estimate and a response mode", () => {
  for (const [type, spec] of Object.entries(BEAT_REGISTRY)) {
    assert.ok(spec.estimateSeconds > 0, `${type} has a positive estimate`);
    assert.ok(["judge", "chat", "acknowledge", "none"].includes(spec.onChildResponse), `${type} has a response mode`);
    assert.equal(typeof spec.boardAction, "function", `${type} resolves a board action`);
  }
  // The estimates the session plan is built from (per the spec).
  assert.equal(BEAT_REGISTRY.EXPLAIN.estimateSeconds, 25);
  assert.equal(BEAT_REGISTRY.REVEAL_PART.estimateSeconds, 15);
  assert.equal(BEAT_REGISTRY.ASK.estimateSeconds, 40);
  // One question + one warm response — a breather, not an interview.
  assert.equal(BEAT_REGISTRY.BREAK_CHAT.estimateSeconds, 60);
  assert.equal(BEAT_REGISTRY.SESSION_START.estimateSeconds, 8);
});
