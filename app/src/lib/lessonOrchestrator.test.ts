import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  buildConfirmBeat,
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
      return { conceptTag, description: null, firstBeat: indices[0], lastBeat: indices[indices.length - 1] };
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
    beat({ type: "CHECKPOINT", segmentIndex: 2, mode: 3 }),
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
    const script = scriptOf([ask, beat({ type: "CHECKPOINT", segmentIndex: 0, mode })]);
    const { state } = advance(script, { ...atBeat(script, 0), mode }, { understood: true, next: "advance" });
    assert.equal(state.unaidedCorrect, 0, `MODE ${mode} answers are assisted, so they don't count`);
  }
});

test("a wrong answer never advances the concept, and counts a miss", () => {
  const script = scriptOf([askMode3(), beat({ type: "CHECKPOINT", segmentIndex: 2, mode: 3 })]);
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

test("a second consecutive miss escalates another_example into a reteach", () => {
  const script = scriptOf([
    beat({ type: "EXPLAIN", segmentIndex: -1, mode: null }),
    beat({ type: "SHOW_BOARD", segmentIndex: 0, mode: 3 }),
    beat({ type: "ASK", segmentIndex: 0, mode: 3, endBy: "asking", expectedAnswer: "42" }),
    beat({ type: "SHOW_BOARD", segmentIndex: 1, mode: 3, itemId: "item-2" }),
  ]);
  const { state } = advance(
    script,
    { ...atBeat(script, 2), recentMisses: 1 },
    { understood: false, next: "another_example" },
  );
  assert.equal(state.beatIndex, 0, "goes back to the explanation instead of offering a third problem");
});

test("simplify drops back to an easier mode's segment", () => {
  const script = scriptOf([
    beat({ type: "SHOW_BOARD", segmentIndex: 0, mode: 2, itemId: "easy" }),
    beat({ type: "SHOW_BOARD", segmentIndex: 1, mode: 3, itemId: "hard" }),
    beat({ type: "ASK", segmentIndex: 1, mode: 3, endBy: "asking", expectedAnswer: "42" }),
  ]);
  const { state } = advance(script, atBeat(script, 2), { understood: false, next: "simplify" });
  assert.equal(state.currentItemId, "easy");
  assert.equal(state.mode, 2);
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

test("the check-in beat never repeats the question or gives the answer", () => {
  const wait = buildWaitBeat(askMode3());
  assert.equal(wait.type, "WAIT");
  assert.equal(wait.maxSentences, 1);
  assert.equal(wait.board.kind, "none", "a check-in must not disturb the board");
  assert.match(wait.goal, /Do NOT repeat the question/);
  assert.match(wait.goal, /do NOT give the answer/);
});

test("the confirm beat repeats the doubtful number without judging it", () => {
  const confirm = buildConfirmBeat(askMode3(), "2311");
  assert.equal(confirm.type, "CONFIRM");
  assert.match(confirm.goal, /2311 නේද/);
  assert.match(confirm.goal, /Do not say whether it is right or wrong/);
  assert.equal(confirm.expectedAnswer, undefined, "the confirm itself is never judged against the answer");
});

test("feedback on a wrong answer withholds the answer and asks a guiding question", () => {
  const wrong = buildFeedbackBeat(askMode3(), false, "42");
  assert.match(wrong.goal, /Do NOT give the answer yet/);
  assert.equal(wrong.endBy, "asking");

  const right = buildFeedbackBeat(askMode3(), true);
  assert.match(right.goal, /Praise the effort/);
  assert.equal(right.endBy, "pausing");
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
  assert.equal(BEAT_REGISTRY.CHECKPOINT.estimateSeconds, 60);
  assert.equal(BEAT_REGISTRY.BREAK_CHAT.estimateSeconds, 120);
});
