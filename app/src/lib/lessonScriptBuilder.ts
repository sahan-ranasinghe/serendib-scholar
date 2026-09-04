import { orderConceptTags, videoTimestampSeconds } from "@/lib/conceptOrdering";
import { blanksForItem, workedStepsForItem, solutionForItem, describeItem, type ItemBlank } from "@/lib/lessonBlanks";
import { parseBoardContent, blockToBoardAction, parseAbacusStep, type BoardBlock } from "@/lib/boardContentParser";
import { estimateBeatSeconds } from "@/lib/beatRegistry";
import { AUTHORED_LINES } from "@/lib/authoredLines";
import type {
  Beat,
  ConceptBlueprint,
  ConceptSummary,
  LessonBlueprint,
  LessonBlueprintOverride,
  LessonScript,
  SessionPlan,
  TeachingMode,
} from "@/lib/lessonOrchestrator";
import { FRAMING_CONCEPT } from "@/lib/lessonOrchestrator";

/**
 * Turns the content bank into a session-partitioned lesson script — the
 * plan the orchestrator walks (see lessonOrchestrator.ts).
 *
 * Two layers of derivation, both stored on the script for review:
 *
 * 1. A per-concept BLUEPRINT (deriveBlueprint): how many explain beats,
 *    how much practice per mode — proportional to how long the real
 *    teacher spent on the concept — and the everyday hook example where
 *    the extraction recorded one. A checked-in override file can hand-edit
 *    any concept's blueprint (see buildLessonScript.ts).
 *
 * 2. A SESSION PLAN: the flat beat list cut into sittings of 20-25
 *    estimated minutes, each framed as chat → goals/recap → work → break →
 *    work → close, using the per-type estimates in beatRegistry.ts.
 *
 * Pure: no database, no network. Same rows in, same script out — which is
 * what makes the lesson_scripts cache and the offline dry run trustworthy.
 */

/** How much of the teacher's verbatim Sinhala rides along with a beat. */
const REFERENCE_WORDING_MAX_CHARS = 300;

/** Sentence budgets per beat type. Small on purpose — this is the pacing control. */
const SENTENCE_BUDGET: Record<string, number> = {
  EXPLAIN: 3,
  SHOW_BOARD: 2,
  REVEAL_PART: 2,
  ASK: 2,
  CHECKPOINT: 1,
  TRANSITION: 2,
  CHAT_OPENER: 3,
  LESSON_GOALS: 4,
  HOOK: 2,
  RECAP: 2,
  BREAK_CHAT: 3,
  CLOSE_SESSION: 3,
};

/** Caps on beats generated from one item. */
const MAX_REVEALS_PER_ITEM = 5;
const MAX_ASKS_PER_ITEM = 4;
const MAX_EXPLAIN_BEATS = 6;

// --- session sizing (seconds, from beatRegistry estimates) ---------------
/** Teaching (non-framing) time to aim for per sitting — with framing this lands sessions at 20-25 min. */
const SESSION_TEACHING_TARGET_SECONDS = 1080;
/** Estimated teaching time after which the mid-session BREAK_CHAT goes in. */
const BREAK_AFTER_TEACHING_SECONDS = 720;
/** Don't close a session below this unless the lesson itself runs out. */
const SESSION_TEACHING_MIN_SECONDS = 600;

interface BankRow {
  id: string;
  concept_tag: string;
  difficulty: string;
  component_type: string;
  component_props: unknown;
  answer: unknown;
  explanation: unknown;
  source: string;
}

interface ExplanationPayload {
  teachingSequence?: unknown;
  explanationDetail?: unknown;
  transcriptExcerpt?: unknown;
  realWorldExamplesUsed?: unknown;
  /** What the teacher had written on her board during this segment (see scripts/backfill-board-content.ts). */
  boardContent?: unknown;
  /** Her transcript cleaned for one-to-one address (see scripts/clean-transcripts.ts) — the tutor's EXACT words. */
  spokenTranscript?: unknown;
}

/** The concept_tag of the video's 00:00:00-00:03:00 opening — LESSON_GOALS material, not a teachable concept. */
export const LESSON_OPENING_CONCEPT = "lessonOpening";

/** Trims verbatim Sinhala to a reference-sized excerpt, cutting at a sentence boundary where possible. */
export function excerptForReference(transcript: string): string {
  const trimmed = transcript.trim();
  if (trimmed.length <= REFERENCE_WORDING_MAX_CHARS) return trimmed;
  const window = trimmed.slice(0, REFERENCE_WORDING_MAX_CHARS);
  const lastStop = Math.max(window.lastIndexOf("."), window.lastIndexOf("।"), window.lastIndexOf("?"));
  return (lastStop > REFERENCE_WORDING_MAX_CHARS / 2 ? window.slice(0, lastStop + 1) : window).trim();
}

function payloadOf(row: BankRow | undefined): ExplanationPayload {
  return (row?.explanation ?? {}) as ExplanationPayload;
}

function sequenceOf(payload: ExplanationPayload): string[] {
  return Array.isArray(payload.teachingSequence)
    ? payload.teachingSequence.filter((e): e is string => typeof e === "string" && e.trim() !== "")
    : [];
}

// ---------------------------------------------------------------------------
// 1. The per-concept blueprint
// ---------------------------------------------------------------------------

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/** Deterministic shuffle for choice buttons (seeded by content, not Math.random, so scripts cache byte-for-byte). */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  let seed = 0;
  for (const item of items) for (const ch of String(item)) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
  for (let i = result.length - 1; i > 0; i -= 1) {
    seed = (seed * 131 + 7) % 997;
    const j = seed % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Derives each concept's shape from its video data.
 *
 * videoMinutes: 3 minutes per verified explanation segment — each
 * explanation row is one 3-minute stretch of the recording, so segment
 * count is the honest proxy for the extraction's approximateMinutesSpent
 * (which lives per 15-minute window, not per concept, in content_bank).
 *
 * Practice volume is proportional to that: the teacher's hour on
 * placeValueBreakdown becomes 3/3/6 items; three minutes on
 * numberSequence becomes 1/1/2. Bounded later by what the bank holds.
 */
export function deriveBlueprint(orderedTags: string[], rows: BankRow[]): LessonBlueprint {
  const concepts: ConceptBlueprint[] = orderedTags.map((conceptTag) => {
    const explanations = rows.filter((r) => r.concept_tag === conceptTag && r.component_type === "explanation");
    const videoMinutes = Math.max(3, explanations.length * 3);

    // The everyday example she opened with, where the extraction recorded
    // one. (Lesson 1's extraction recorded none — the machinery is here
    // for lessons whose data has them.)
    let hookExample: string | null = null;
    for (const row of [...explanations].sort((a, b) => a.source.localeCompare(b.source))) {
      const examples = payloadOf(row).realWorldExamplesUsed;
      if (Array.isArray(examples) && examples.length > 0 && typeof examples[0] === "string") {
        hookExample = examples[0];
        break;
      }
    }

    return {
      conceptTag,
      videoMinutes,
      explainBeats: Math.min(MAX_EXPLAIN_BEATS, Math.max(1, sequenceOf(payloadOf(explanations[0])).length)),
      hookExample,
      items: {
        mode1: clamp(Math.round(videoMinutes / 8), 1, 3),
        mode2: clamp(Math.round(videoMinutes / 8), 1, 3),
        mode3: clamp(Math.round(videoMinutes / 5), 2, 6),
      },
    };
  });
  return { derivedFrom: "3 minutes per verified explanation segment in content_bank", concepts };
}

// ---------------------------------------------------------------------------
// 2. Per-concept beats
// ---------------------------------------------------------------------------

function baseBeat(conceptTag: string, index: number, suffix: string): Pick<Beat, "id" | "sessionIndex"> {
  // sessionIndex is stamped later, when sessions are cut.
  return { id: `${conceptTag}#${index}:${suffix}`, sessionIndex: 0 };
}

/**
 * teachingSequence entries that describe the lesson's own opening (welcome,
 * goals) rather than the concept itself — redundant when a LESSON_GOALS
 * beat already covers them, so the first concept skips them in that case.
 */
const OPENING_SEQUENCE_ENTRY = /welcom|outlines lesson goals/i;

function buildExplainBeats(
  conceptTag: string,
  explanations: BankRow[],
  blueprint: ConceptBlueprint,
  skipOpeningEntries: boolean,
): Beat[] {
  const primary = explanations[0];
  if (!primary) return [];
  const payload = payloadOf(primary);
  let sequence = sequenceOf(payload);
  if (skipOpeningEntries) {
    const filtered = sequence.filter((entry) => !OPENING_SEQUENCE_ENTRY.test(entry));
    // Never filter a concept down to nothing.
    if (filtered.length > 0) sequence = filtered;
  }
  const transcript = typeof payload.transcriptExcerpt === "string" ? payload.transcriptExcerpt : "";
  const reference = transcript ? excerptForReference(transcript) : undefined;

  if (sequence.length === 0) {
    const detail = typeof payload.explanationDetail === "string" ? payload.explanationDetail : null;
    if (!detail) return [];
    return [
      {
        ...baseBeat(conceptTag, 0, "explain-0"),
        type: "EXPLAIN",
        conceptTag,
        mode: null,
        itemId: primary.id,
        segmentIndex: -1,
        goal: `Introduce this idea to the child: ${detail}`,
        maxSentences: SENTENCE_BUDGET.EXPLAIN,
        boardDescription: "nothing yet",
        board: { kind: "none" },
        referenceWording: reference,
        endBy: "pausing",
      },
    ];
  }

  // What she was showing while she said it: her board text, parsed into
  // stageable blocks. Beat i shows block i; beats past the last block keep
  // re-staging the final block (a present action, never "unchanged").
  const boardText = typeof payload.boardContent === "string" ? payload.boardContent : "";
  const blocks: BoardBlock[] = boardText.trim() !== "" ? parseBoardContent(boardText) : [];

  return sequence.slice(0, blueprint.explainBeats).map((entry, index) => {
    const beatId = `${conceptTag}#${index}:explain-${index}`;
    const block = blocks.length > 0 ? blocks[Math.min(index, blocks.length - 1)] : null;
    const board = block ? blockToBoardAction(block, beatId) : ({ kind: "none" } as const);
    return {
      ...baseBeat(conceptTag, index, `explain-${index}`),
      type: "EXPLAIN" as const,
      conceptTag,
      mode: null,
      itemId: primary.id,
      segmentIndex: -1,
      goal: `Teach this one step of the idea, in your own warm Sinhala: ${entry}`,
      maxSentences: SENTENCE_BUDGET.EXPLAIN,
      boardDescription: block
        ? block.kind === "abacus"
          ? `the abacus building up ${block.digits.join("")}, bead by bead`
          : block.kind === "expansion"
            ? `${block.prompt} written in expanded form`
            : block.kind === "table"
              ? "the number-and-name table she used"
              : "her board notes for this part"
        : "nothing yet",
      board,
      // Only the first beat carries the excerpt — repeating it invites recital.
      referenceWording: index === 0 ? reference : undefined,
      endBy: "pausing" as const,
    };
  });
}

/** Sinhala-name answers from OTHER items of the concept — tap-choice distractors. */
function nameDistractors(conceptRows: BankRow[], excludeItemId: string, correct: string): string[] {
  const pool = new Set<string>();
  for (const row of conceptRows) {
    if (row.id === excludeItemId || row.component_type === "explanation") continue;
    for (const blank of blanksForItem(row.component_type, row.component_props, row.answer)) {
      if (blank.value && /[඀-෿]/u.test(blank.value) && blank.value !== correct) pool.add(blank.value);
    }
    const solution = solutionForItem(row.answer);
    if (solution && /[඀-෿]/u.test(solution) && solution !== correct) pool.add(solution);
    const label = (row.answer as { label?: unknown } | null)?.label;
    if (typeof label === "string" && label.trim() && label !== correct) pool.add(label.trim());
  }
  return [...pool].slice(0, 2);
}

function buildItemSegment(
  item: BankRow,
  mode: TeachingMode,
  segmentIndex: number,
  startIndex: number,
  conceptRows: BankRow[],
): Beat[] {
  const conceptTag = item.concept_tag;
  const description = describeItem(item.component_type, item.component_props);
  const blanks = blanksForItem(item.component_type, item.component_props, item.answer).filter(
    (blank) => blank.value !== null,
  ) as (ItemBlank & { value: string })[];
  const steps = workedStepsForItem(item.answer);
  const solution = solutionForItem(item.answer);
  const beats: Beat[] = [];
  let index = startIndex;

  const push = (beat: Omit<Beat, "id" | "sessionIndex">) => {
    beats.push({ ...beat, ...baseBeat(conceptTag, index, `${beat.type.toLowerCase()}-s${segmentIndex}`) });
    index += 1;
  };

  // The animated abacus is its own manipulative: demonstrations start with
  // bare rods and beads land per reveal; a MODE 3 reading task shows it
  // complete and asks for the number.
  const abacusDigits =
    item.component_type === "AbacusDiagram" && Array.isArray((item.component_props as { digits?: unknown }).digits)
      ? ((item.component_props as { digits: number[] }).digits ?? null)
      : null;

  push({
    type: "SHOW_BOARD",
    conceptTag,
    mode,
    itemId: item.id,
    segmentIndex,
    goal: "Introduce the item (verbatim line).",
    spokenText:
      mode === 1
        ? AUTHORED_LINES.showBoardMode1
        : mode === 2
          ? AUTHORED_LINES.showBoardMode2
          : AUTHORED_LINES.showBoardMode3,
    maxSentences: SENTENCE_BUDGET.SHOW_BOARD,
    boardDescription: description,
    board: abacusDigits
      ? { kind: "abacus_set", digits: abacusDigits, animate: false, startEmpty: mode !== 3 }
      : { kind: "stage_item", itemId: item.id },
    endBy: "pausing",
  });

  const useBlanks = blanks.length > 0;
  const revealCount = mode === 1 ? MAX_REVEALS_PER_ITEM : mode === 2 ? Math.ceil(MAX_REVEALS_PER_ITEM / 2) : 0;

  if (useBlanks) {
    const reveals = mode === 3 ? [] : blanks.slice(0, revealCount);
    const asks =
      mode === 1 ? [] : blanks.slice(mode === 2 ? reveals.length : 0, (mode === 2 ? reveals.length : 0) + MAX_ASKS_PER_ITEM);
    for (const blank of reveals) {
      push({
        type: "REVEAL_PART",
        conceptTag,
        mode,
        itemId: item.id,
        segmentIndex,
        goal: "Write-in reveal (verbatim line).",
        spokenText: AUTHORED_LINES.revealBlank.replace("{value}", blank.value),
        maxSentences: SENTENCE_BUDGET.REVEAL_PART,
        boardDescription: description,
        board: { kind: "reveal_part", itemId: item.id, rowIndex: blank.rowIndex, field: blank.field, value: blank.value },
        endBy: "pausing",
      });
    }
    for (const blank of asks) {
      // A Sinhala number-name answer gets tap choices (correct + two
      // distractors from the bank); numeric answers get the number pad —
      // the runtime decides from the expected answer's shape.
      const isName = /[඀-෿]/u.test(blank.value);
      const distractors = isName ? nameDistractors(conceptRows, item.id, blank.value) : [];
      push({
        type: "ASK",
        conceptTag,
        mode,
        itemId: item.id,
        segmentIndex,
        goal: `Ask the child for ${blank.label}. Ask only this one thing.`,
        maxSentences: SENTENCE_BUDGET.ASK,
        boardDescription: description,
        board: { kind: "set_active_blank", itemId: item.id, rowIndex: blank.rowIndex, field: blank.field },
        expectedAnswer: blank.value,
        ...(distractors.length === 2 ? { answerChoices: shuffle([blank.value, ...distractors]) } : {}),
        endBy: "asking",
      });
    }
  } else {
    const reveals = mode === 3 ? [] : steps.slice(0, revealCount);
    for (const step of reveals) {
      // An abacus bead step ("දාහේ ස්ථානයේ ගණක 5යි") lands its beads on the
      // rod as she counts them; other steps stay verbal.
      const bead = abacusDigits ? parseAbacusStep(step, abacusDigits.length) : null;
      push({
        type: "REVEAL_PART",
        conceptTag,
        mode,
        itemId: item.id,
        segmentIndex,
        goal: "Her worked step, verbatim.",
        // Her own working line IS the speech — "දාහේ ස්ථානයේ ගණක 5යි".
        spokenText: `${step.replace(/\.$/u, "")}.`,
        maxSentences: SENTENCE_BUDGET.REVEAL_PART,
        boardDescription: description,
        board: bead ? { kind: "abacus_add_bead", rod: bead.rod, count: bead.count } : { kind: "none" },
        endBy: "pausing",
      });
    }
    if (mode !== 1 && solution) {
      const isName = /[඀-෿]/u.test(solution);
      const distractors = isName ? nameDistractors(conceptRows, item.id, solution) : [];
      push({
        type: "ASK",
        conceptTag,
        mode,
        itemId: item.id,
        segmentIndex,
        goal: "Ask the child for the answer to this one.",
        maxSentences: SENTENCE_BUDGET.ASK,
        boardDescription: description,
        board: { kind: "none" },
        expectedAnswer: solution,
        ...(distractors.length === 2 ? { answerChoices: shuffle([solution, ...distractors]) } : {}),
        endBy: "asking",
      });
    }
  }

  // A soft check, not a gate: the mic opens briefly; any chirp gets one
  // warm "හරි!" and the lesson flows on — never a mandatory yes/no reply.
  push({
    type: "SOFT_CHECK",
    conceptTag,
    mode,
    itemId: item.id,
    segmentIndex,
    goal: "Soft check-in (verbatim line).",
    spokenText: AUTHORED_LINES.checkpoint,
    maxSentences: SENTENCE_BUDGET.CHECKPOINT,
    boardDescription: description,
    board: { kind: "none" },
    endBy: "asking",
  });

  return beats;
}

function selectItemsForMode(problems: BankRow[], mode: TeachingMode, count: number, used: Set<string>): BankRow[] {
  const preference =
    mode === 1 ? ["intro", "standard", "challenge"] : mode === 2 ? ["standard", "intro", "challenge"] : ["standard", "challenge", "intro"];
  let available = problems.filter((row) => !used.has(row.id));
  if (mode !== 1) {
    const askable = available.filter(
      (row) =>
        blanksForItem(row.component_type, row.component_props, row.answer).some((b) => b.value !== null) ||
        solutionForItem(row.answer) !== null,
    );
    if (askable.length > 0) available = askable;
  }
  const ordered = [...available].sort((a, b) => preference.indexOf(a.difficulty) - preference.indexOf(b.difficulty));
  const picked = ordered.slice(0, count);
  for (const row of picked) used.add(row.id);
  return picked;
}

/** All of one concept's beats: HOOK (where her data has one) → explain run → item segments → transition. */
function buildConceptBeats(
  blueprint: ConceptBlueprint,
  description: string | null,
  rows: BankRow[],
  skipOpeningEntries: boolean,
  lessonTitle: string,
): Beat[] {
  const conceptTag = blueprint.conceptTag;
  const explanations = rows
    .filter((row) => row.component_type === "explanation")
    .sort((a, b) => (videoTimestampSeconds(a.source) ?? 0) - (videoTimestampSeconds(b.source) ?? 0));
  const problems = rows.filter(
    (row) =>
      row.component_type !== "explanation" &&
      (blanksForItem(row.component_type, row.component_props, row.answer).some((b) => b.value !== null) ||
        workedStepsForItem(row.answer).length > 0 ||
        solutionForItem(row.answer) !== null),
  );

  const beats: Beat[] = [];

  if (blueprint.hookExample) {
    // The hook text is spoken VERBATIM (say_exactly) and then behaves like
    // a CHECK_IN: ask, wait. If the blueprint names an expected answer, a
    // match earns the exact praise line; anything else — wrong, off-topic,
    // silence — advances warmly into the explain run with no correction.
    beats.push({
      ...baseBeat(conceptTag, 0, "hook"),
      type: "HOOK",
      conceptTag,
      mode: null,
      itemId: null,
      segmentIndex: -1,
      goal: "The hook, verbatim — ask it and wait.",
      spokenText: blueprint.hookExample,
      expectedAnswer: blueprint.hookExpectedAnswer ?? undefined,
      praiseText: blueprint.hookPraise ?? undefined,
      maxSentences: SENTENCE_BUDGET.HOOK,
      boardDescription: `a title card: ${lessonTitle}`,
      board: { kind: "title_card", title: lessonTitle, emoji: "🤔" },
      endBy: "asking",
    });
  }

  const allCleaned =
    explanations.length > 0 &&
    explanations.every((row) => typeof payloadOf(row).spokenTranscript === "string" && String(payloadOf(row).spokenTranscript).trim() !== "");
  const explainBeats = allCleaned
    ? buildSpokenExplainBeats(conceptTag, explanations)
    : buildExplainBeats(conceptTag, explanations, blueprint, skipOpeningEntries);
  // The board must never be empty while an idea is introduced: if nothing
  // is staged yet (no hook), the first explain beat raises a title card.
  if (!blueprint.hookExample && explainBeats.length > 0) {
    explainBeats[0] = {
      ...explainBeats[0],
      boardDescription: `a title card: ${lessonTitle}`,
      board: { kind: "title_card", title: lessonTitle, emoji: "🧮" },
    };
  }
  beats.push(...explainBeats);

  const used = new Set<string>();
  let segmentIndex = 0;
  for (const mode of [1, 2, 3] as TeachingMode[]) {
    const count = blueprint.items[`mode${mode}` as keyof ConceptBlueprint["items"]];
    for (const item of selectItemsForMode(problems, mode, count, used)) {
      beats.push(...buildItemSegment(item, mode, segmentIndex, beats.length, rows));
      segmentIndex += 1;
    }
  }

  beats.push({
    ...baseBeat(conceptTag, beats.length, "transition"),
    type: "TRANSITION",
    conceptTag,
    mode: null,
    itemId: null,
    segmentIndex: -1,
    goal: "Wrap (verbatim line).",
    spokenText: AUTHORED_LINES.transition,
    maxSentences: SENTENCE_BUDGET.TRANSITION,
    boardDescription: "a bright well-done card",
    board: { kind: "title_card", title: "⭐", emoji: "⭐" },
    endBy: "pausing",
  });

  return beats;
}

// ---------------------------------------------------------------------------
// 3. Session framing and partitioning
// ---------------------------------------------------------------------------

function framingBeat(
  sessionIndex: number,
  suffix: string,
  type: Beat["type"],
  goal: string,
  endBy: Beat["endBy"],
  board: Beat["board"],
  referenceWording?: string,
): Beat {
  return {
    id: `session-${sessionIndex}:${suffix}`,
    sessionIndex,
    type,
    conceptTag: FRAMING_CONCEPT,
    mode: null,
    itemId: null,
    segmentIndex: -1,
    goal,
    maxSentences: SENTENCE_BUDGET[type] ?? 2,
    boardDescription:
      board.kind === "title_card" ? `a title card: ${board.title}` : "whatever is already showing",
    board,
    referenceWording,
    endBy,
  };
}

/** A safe place to cut or pause: never in the middle of a worked item's segment. */
function isBoundary(beat: Beat | undefined): boolean {
  if (!beat) return true;
  return beat.type === "SHOW_BOARD" || beat.type === "EXPLAIN" || beat.type === "HOOK" || beat.type === "TRANSITION";
}

/** How much of her welcome the first sitting opens with (~1 minute of speech). */
const MAX_LESSON_GOALS_BEATS = 4;

function buildLessonGoalsBeats(openingRows: BankRow[], orderedTags: string[], descriptions: Map<string, string>, lessonTitle: string): Beat[] {
  const primary = [...openingRows].sort((a, b) => a.source.localeCompare(b.source))[0];
  if (!primary) return [];
  const payload = payloadOf(primary);
  const spoken = typeof payload.spokenTranscript === "string" ? payload.spokenTranscript : "";

  if (spoken.trim() !== "") {
    // Her actual lesson opening, verbatim — split into speakable beats.
    return chunkSpokenTranscript(spoken)
      .slice(0, MAX_LESSON_GOALS_BEATS)
      .map((chunk, index) => ({
        ...framingBeat(
          0,
          `lesson-goals-${index}`,
          // A question in her opening is at most a soft window — the very
          // first minute must never hard-block on an answer.
          chunk.kind === "explain" ? "LESSON_GOALS" : "SOFT_CHECK",
          "Her lesson opening, verbatim.",
          chunk.kind === "explain" ? "pausing" : "asking",
          { kind: "title_card", title: lessonTitle, emoji: "📚" },
        ),
        spokenText: chunk.text,
      }));
  }

  // Fallback (opening row not yet cleaned): the old free-form beat.
  const transcript = typeof payload.transcriptExcerpt === "string" ? payload.transcriptExcerpt : "";
  const goals = orderedTags
    .map((tag) => descriptions.get(tag))
    .filter((d): d is string => !!d)
    .slice(0, 4);
  return [
    framingBeat(
      0,
      "lesson-goals",
      "LESSON_GOALS",
      `Tell the child what this whole lesson is about, in a child's terms — the way the real teacher opened it: ` +
        `working with big numbers up to 100,000 (${goals.join("; ")}). Make it sound like an adventure ahead, not a syllabus.`,
      "pausing",
      { kind: "title_card", title: lessonTitle, emoji: "📚" },
      transcript ? excerptForReference(transcript) : undefined,
    ),
  ];
}

/**
 * Cuts the concatenated concept beats into sittings and wraps each in its
 * framing: CHAT_OPENER → (LESSON_GOALS | RECAP) → work → BREAK_CHAT → work
 * → CLOSE_SESSION. Estimates come from beatRegistry.ts.
 */
function assembleSessions(
  work: Beat[],
  lessonGoals: Beat[],
  descriptions: Map<string, string>,
  lessonTitle: string,
): { beats: Beat[]; sessions: SessionPlan[] } {
  // First: cut the work into per-session slices by estimated teaching time.
  const slices: Beat[][] = [];
  let current: Beat[] = [];
  let currentSeconds = 0;
  for (let i = 0; i < work.length; i += 1) {
    const beat = work[i];
    const estimate = estimateBeatSeconds(beat);
    if (
      currentSeconds + estimate > SESSION_TEACHING_TARGET_SECONDS &&
      currentSeconds >= SESSION_TEACHING_MIN_SECONDS &&
      isBoundary(beat)
    ) {
      slices.push(current);
      current = [];
      currentSeconds = 0;
    }
    current.push(beat);
    currentSeconds += estimate;
  }
  if (current.length > 0) slices.push(current);

  // Then: frame each slice as a session.
  const beats: Beat[] = [];
  const sessions: SessionPlan[] = [];

  slices.forEach((slice, sessionIndex) => {
    const firstBeat = beats.length;
    const conceptTags = [...new Set(slice.map((b) => b.conceptTag).filter((t) => t !== FRAMING_CONCEPT))];

    beats.push(
      framingBeat(
        sessionIndex,
        "chat-opener",
        "CHAT_OPENER",
        "Ask how their day was — school, friends, something they did today.",
        "asking",
        // Chat has no lesson visual; the runtime may swap this goal for a
        // personalised opener (see /api/opener).
        { kind: "title_card", title: lessonTitle, emoji: "👋" },
      ),
    );
    if (sessionIndex === 0 && lessonGoals.length > 0) {
      beats.push(...lessonGoals);
    } else if (sessionIndex > 0) {
      // A placeholder the runtime expands into real review questions from
      // child_progress (weakest concepts first) — the script cannot know
      // at build time what this child struggled with.
      beats.push(
        framingBeat(
          sessionIndex,
          "recap",
          "RECAP",
          "Tell the child you'll quickly look back together at what they worked on last time, before the new part.",
          "pausing",
          { kind: "title_card", title: lessonTitle, emoji: "🔄" },
        ),
      );
    }

    // Work, with the break dropped in after ~12 minutes of teaching.
    let teachingSeconds = 0;
    let breakPlaced = false;
    slice.forEach((beat, indexInSlice) => {
      if (
        !breakPlaced &&
        teachingSeconds >= BREAK_AFTER_TEACHING_SECONDS &&
        isBoundary(beat) &&
        indexInSlice < slice.length - 1
      ) {
        beats.push(
          framingBeat(
            sessionIndex,
            "break-chat",
            "BREAK_CHAT",
            "Ask what they like doing when schoolwork is done, or let them tell you anything at all.",
            "asking",
            { kind: "title_card", title: lessonTitle, emoji: "⛱️" },
          ),
        );
        breakPlaced = true;
      }
      beats.push({ ...beat, sessionIndex });
      teachingSeconds += estimateBeatSeconds(beat);
    });

    const nextSlice = slices[sessionIndex + 1];
    const nextConcept = nextSlice?.find((b) => b.conceptTag !== FRAMING_CONCEPT)?.conceptTag;
    const preview = nextConcept
      ? (descriptions.get(nextConcept) ?? nextConcept)
      : "how far they've come through the whole lesson";
    beats.push(
      framingBeat(sessionIndex, "close", "CLOSE_SESSION", `Next time: ${preview}.`, "pausing", {
        kind: "title_card",
        title: lessonTitle,
        emoji: "🌟",
      }),
    );

    const lastBeat = beats.length - 1;
    sessions.push({
      index: sessionIndex,
      firstBeat,
      lastBeat,
      estimatedSeconds: beats.slice(firstBeat, lastBeat + 1).reduce((sum, b) => sum + estimateBeatSeconds(b), 0),
      conceptTags,
    });
  });

  return { beats, sessions };
}

/** Sentence boundaries in spoken Sinhala transcripts (period/question/exclamation + space). */
function splitSinhalaSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!।])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

/** How a chunk hands the turn over (or doesn't). */
export type PauseKind = "explain" | "soft" | "ask";

interface SpokenChunk {
  text: string;
  kind: PauseKind;
}

/** Substantive question words — a question the child COULD answer. */
const SUBSTANTIVE_QUESTION = /(කවුද|කාටද|මොකක්ද|මොනවද|කීයක්ද|කීයද|කොහොමද|කියන්න පුළුවන්)/u;
/** Her rhetorical tags — pacing, never a turn handover. */
const RHETORICAL_TAG = /(නේද|හරිද|බලමුද|කියමුද|ලියමුද|එහෙනම්|එහෙමද|ඕනද)\s*\?$/u;
/** An explicit prompt to actually answer — this, and only this, makes a transcript question an ASK. */
const EXPLICIT_PROMPT = /(කියන්න බලන්න|හිතලා කියන්න|කියන්නකෝ)/u;

/**
 * Classifies one question sentence, with one sentence of lookahead:
 *   RHETORICAL — a tag ("නේද?"), a tiny question, or one she answers
 *     herself immediately ("ඔවු…"): stays inline with a 1.0s pause marker
 *     ("…"); the mic never opens.
 *   ask — she explicitly tells the child to answer ("කියන්න බලන්න").
 *   soft — substantive but she carries on herself: a 3s mic window.
 */
export function classifyQuestion(sentence: string, nextSentence: string | undefined): PauseKind {
  if (EXPLICIT_PROMPT.test(sentence) || (nextSentence !== undefined && EXPLICIT_PROMPT.test(nextSentence))) {
    return "ask";
  }
  if (RHETORICAL_TAG.test(sentence) || sentence.length < 25) return "explain";
  // She answers herself straight away → rhetorical in effect.
  if (nextSentence !== undefined && /^(ඔවු|ඔව්|හරි|ආ)\b/u.test(nextSentence)) return "explain";
  if (SUBSTANTIVE_QUESTION.test(sentence)) return "soft";
  return "explain";
}

/**
 * Groups her sentences into speakable beats (~15-25s), classifying every
 * question into one of the three pause types. Rhetorical questions stay
 * inside the flow with a "…" pause marker appended (the reader naturally
 * rests on it ~1s); soft checks and asks close their chunk and hand the
 * turn over per their kind.
 */
export function chunkSpokenTranscript(text: string): SpokenChunk[] {
  const sentences = splitSinhalaSentences(text);
  const chunks: SpokenChunk[] = [];
  let current: string[] = [];
  const flush = (kind: PauseKind) => {
    if (current.length === 0) return;
    chunks.push({ text: current.join(" "), kind });
    current = [];
  };
  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i];
    if (sentence.endsWith("?")) {
      const kind = classifyQuestion(sentence, sentences[i + 1]);
      if (kind === "explain") {
        // Inline, with the 1.0s pause marker.
        current.push(`${sentence}…`);
      } else {
        current.push(sentence);
        flush(kind);
        continue;
      }
    } else {
      current.push(sentence);
    }
    const joined = current.join(" ");
    if (current.length >= 6 || joined.length >= 200 || (current.length >= 2 && joined.length >= 120)) {
      // Her spoken sentences are short ("හරි.", "බලන්න.") — chunk by
      // accumulated length (~120-200 chars ≈ 15-25s), not sentence count.
      flush("explain");
    }
  }
  flush("explain");
  return chunks;
}

/**
 * The transcript-driven explain run: her cleaned verbatim words, in her
 * order, split into speakable beats — EXPLAIN for statements, CHECK_IN for
 * her questions. Each segment's boardContent blocks are staged across that
 * segment's beats (first block on the first beat, the rest spread), so the
 * abacus never sits empty while she describes it.
 *
 * Used whenever every explanation row carries spokenTranscript; the older
 * bullet-goal path remains only as a fallback for uncleaned rows.
 */
function buildSpokenExplainBeats(conceptTag: string, explanations: BankRow[]): Beat[] {
  const beats: Beat[] = [];
  let index = 0;
  for (const row of explanations) {
    const payload = payloadOf(row);
    const spoken = typeof payload.spokenTranscript === "string" ? payload.spokenTranscript : "";
    if (!spoken.trim()) continue;
    const chunks = chunkSpokenTranscript(spoken);
    const boardText = typeof payload.boardContent === "string" ? payload.boardContent : "";
    const blocks: BoardBlock[] = boardText.trim() !== "" ? parseBoardContent(boardText) : [];

    chunks.forEach((chunk, chunkIndex) => {
      // Spread this segment's board blocks across its beats: block j lands
      // on beat floor(j * chunks/blocks) — the first block (usually the
      // number/abacus she introduces) on the segment's first beat.
      const blockIndex = blocks.findIndex(
        (_, j) => Math.floor((j * chunks.length) / Math.max(blocks.length, 1)) === chunkIndex,
      );
      const block = blockIndex !== -1 ? blocks[blockIndex] : null;
      const beatId = `${conceptTag}#${index}:spoken-${index}`;
      const beatType = chunk.kind === "ask" ? "ASK" : chunk.kind === "soft" ? "SOFT_CHECK" : "EXPLAIN";
      beats.push({
        ...baseBeat(conceptTag, index, `spoken-${index}`),
        type: beatType,
        conceptTag,
        mode: null,
        itemId: row.id,
        segmentIndex: -1,
        goal:
          chunk.kind === "ask"
            ? "Her own question, verbatim — ask it and wait for the child."
            : chunk.kind === "soft"
              ? "Her question, verbatim — a brief window, then her own words continue."
              : "Her own words, verbatim.",
        spokenText: chunk.text,
        maxSentences: 3,
        boardDescription: block
          ? block.kind === "abacus"
            ? `the abacus building up ${block.digits.join("")}, bead by bead`
            : block.kind === "expansion"
              ? `${block.prompt} written in expanded form`
              : block.kind === "table"
                ? "the number-and-name table she used"
                : "her board notes"
          : "whatever is already showing",
        board: block ? blockToBoardAction(block, beatId) : { kind: "none" },
        endBy: chunk.kind === "explain" ? "pausing" : "asking",
      });
      index += 1;
    });
  }
  return beats;
}

/**
 * Alternate explanation angles for a concept: the explanationDetail of each
 * NON-primary explanation segment (the primary one feeds the explain run).
 * A RETEACH beat picks one not yet used this session, so a struggling child
 * hears the idea from a different direction instead of hearing the same
 * introduction again.
 */
function reteachAnglesFor(conceptTag: string, rows: BankRow[]): string[] {
  const explanations = rows
    .filter((row) => row.concept_tag === conceptTag && row.component_type === "explanation")
    .sort((a, b) => (videoTimestampSeconds(a.source) ?? 0) - (videoTimestampSeconds(b.source) ?? 0));
  return explanations
    .slice(1) // [0] is the primary explain run
    .map((row) => payloadOf(row).explanationDetail)
    .filter((detail): detail is string => typeof detail === "string" && detail.trim() !== "")
    .map((detail) => detail.slice(0, 240))
    .slice(0, 4);
}

// ---------------------------------------------------------------------------
// 4. The whole script
// ---------------------------------------------------------------------------

export interface BuildOptions {
  /** Hand-edited per-concept blueprint entries, merged FIELD BY FIELD over the derived ones by conceptTag. */
  blueprintOverride?: LessonBlueprintOverride | null;
  /** Shown on title cards (lesson goals, transitions, session close). */
  lessonTitle?: string;
}

export function buildScriptFromRows(
  rows: BankRow[],
  descriptions: Map<string, string>,
  subject: string,
  grade: number,
  lesson: number,
  options: BuildOptions = {},
): LessonScript {
  const openingRows = rows.filter((row) => row.concept_tag === LESSON_OPENING_CONCEPT);
  const teachableRows = rows.filter((row) => row.concept_tag !== LESSON_OPENING_CONCEPT);
  const orderedTags = orderConceptTags(teachableRows);

  const derived = deriveBlueprint(orderedTags, teachableRows);
  // Field-level merge, never whole-entry replacement: an override that only
  // says { conceptTag, hookExample } keeps the derived videoMinutes/
  // explainBeats/items. (Replacing the entry wholesale was a real bug —
  // the missing fields became undefined and slice(0, undefined) turned
  // "one item" caps into "every item".)
  const overrides = new Map((options.blueprintOverride?.concepts ?? []).map((c) => [c.conceptTag, c]));
  const overriddenConcepts: string[] = [];
  const mergedConcepts = derived.concepts.map((concept) => {
    const override = overrides.get(concept.conceptTag);
    if (!override) return concept;
    overriddenConcepts.push(concept.conceptTag);
    return {
      ...concept,
      ...override,
      items: { ...concept.items, ...(override.items ?? {}) },
    };
  });
  const knownTags = new Set(derived.concepts.map((c) => c.conceptTag));
  const unmatchedOverrideTags = [...overrides.keys()].filter((tag) => !knownTags.has(tag));
  if (unmatchedOverrideTags.length > 0) {
    // Almost always a typo in the override file — say so instead of
    // silently dropping the entry.
    console.warn(
      `[lessonScriptBuilder] Blueprint override entries match no concept and were ignored: ${unmatchedOverrideTags.join(", ")}`,
    );
  }
  const blueprint: LessonBlueprint = {
    derivedFrom:
      overriddenConcepts.length > 0
        ? `${derived.derivedFrom}; hand-edited overrides applied to: ${overriddenConcepts.join(", ")}`
        : derived.derivedFrom,
    concepts: mergedConcepts,
    ...(overriddenConcepts.length > 0 ? { overriddenConcepts } : {}),
    ...(unmatchedOverrideTags.length > 0 ? { unmatchedOverrideTags } : {}),
  };

  const lessonTitle = options.lessonTitle ?? `${subject} — lesson ${lesson}`;
  const lessonGoals = buildLessonGoalsBeats(openingRows, orderedTags, descriptions, lessonTitle);

  const work: Beat[] = [];
  blueprint.concepts.forEach((conceptBlueprint, conceptIndex) => {
    const conceptRows = teachableRows.filter((row) => row.concept_tag === conceptBlueprint.conceptTag);
    const conceptBeats = buildConceptBeats(
      conceptBlueprint,
      descriptions.get(conceptBlueprint.conceptTag) ?? null,
      conceptRows,
      // LESSON_GOALS already delivers the welcome + goals; don't have the
      // first concept's explain run say them again.
      conceptIndex === 0 && lessonGoals.length > 0,
      lessonTitle,
    );
    // A concept with nothing but a TRANSITION isn't teachable.
    if (conceptBeats.some((beat) => beat.type !== "TRANSITION")) work.push(...conceptBeats);
  });
  const { beats, sessions } = assembleSessions(work, lessonGoals, descriptions, lessonTitle);

  const concepts: ConceptSummary[] = orderedTags
    .map((conceptTag) => {
      const indices = beats.map((b, i) => (b.conceptTag === conceptTag ? i : -1)).filter((i) => i !== -1);
      if (indices.length === 0) return null;
      const firstShow = indices.find((i) => beats[i].type === "SHOW_BOARD");
      return {
        conceptTag,
        description: descriptions.get(conceptTag) ?? null,
        firstBeat: indices[0],
        lastBeat: indices[indices.length - 1],
        // A miss never moves the lesson before this (see findJumpTarget).
        firstPracticeBeat: firstShow ?? indices[0],
        reteachAngles: reteachAnglesFor(conceptTag, teachableRows),
      };
    })
    .filter((c): c is ConceptSummary => c !== null);

  return {
    subject,
    grade,
    lesson,
    beats,
    sessions,
    concepts,
    blueprint,
    builtAt: new Date().toISOString(),
  };
}

export type { BankRow };
