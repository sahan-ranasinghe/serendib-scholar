import { orderConceptTags, videoTimestampSeconds } from "@/lib/conceptOrdering";
import { blanksForItem, workedStepsForItem, solutionForItem, describeItem, type ItemBlank } from "@/lib/lessonBlanks";
import { beatSpec } from "@/lib/beatRegistry";
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

  return sequence.slice(0, blueprint.explainBeats).map((entry, index) => ({
    ...baseBeat(conceptTag, index, `explain-${index}`),
    type: "EXPLAIN" as const,
    conceptTag,
    mode: null,
    itemId: primary.id,
    segmentIndex: -1,
    goal: `Teach this one step of the idea, in your own warm Sinhala: ${entry}`,
    maxSentences: SENTENCE_BUDGET.EXPLAIN,
    boardDescription: "nothing yet",
    board: { kind: "none" as const },
    // Only the first beat carries the excerpt — repeating it invites recital.
    referenceWording: index === 0 ? reference : undefined,
    endBy: "pausing" as const,
  }));
}

function buildItemSegment(item: BankRow, mode: TeachingMode, segmentIndex: number, startIndex: number): Beat[] {
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

  push({
    type: "SHOW_BOARD",
    conceptTag,
    mode,
    itemId: item.id,
    segmentIndex,
    goal:
      mode === 1
        ? "Tell the child you'll work this one through together so they can watch how it's done."
        : mode === 2
          ? "Tell the child you'll start this one and they'll finish it with you."
          : "Tell the child this one is theirs to try.",
    maxSentences: SENTENCE_BUDGET.SHOW_BOARD,
    boardDescription: description,
    board: { kind: "stage_item", itemId: item.id },
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
        goal: `Explain, then write in, ${blank.label} — the answer is ${blank.value}. Say why it is that, don't just state it.`,
        maxSentences: SENTENCE_BUDGET.REVEAL_PART,
        boardDescription: description,
        board: { kind: "reveal_part", itemId: item.id, rowIndex: blank.rowIndex, field: blank.field, value: blank.value },
        endBy: "pausing",
      });
    }
    for (const blank of asks) {
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
        endBy: "asking",
      });
    }
  } else {
    const reveals = mode === 3 ? [] : steps.slice(0, revealCount);
    for (const step of reveals) {
      push({
        type: "REVEAL_PART",
        conceptTag,
        mode,
        itemId: item.id,
        segmentIndex,
        goal: `Walk the child through this step of the working: ${step}`,
        maxSentences: SENTENCE_BUDGET.REVEAL_PART,
        boardDescription: description,
        board: { kind: "none" },
        endBy: "pausing",
      });
    }
    if (mode !== 1 && solution) {
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
        endBy: "asking",
      });
    }
  }

  push({
    type: "CHECKPOINT",
    conceptTag,
    mode,
    itemId: item.id,
    segmentIndex,
    goal: "Check the child is still with you before going on. One short question, warmly.",
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
    beats.push({
      ...baseBeat(conceptTag, 0, "hook"),
      type: "HOOK",
      conceptTag,
      mode: null,
      itemId: null,
      segmentIndex: -1,
      // Neutral on provenance: a hook can come from her extraction data OR
      // from the hand-edited blueprint file — the director line shouldn't
      // claim she said something a human authored.
      goal:
        `Before any maths, open with this everyday example: ` +
        `${blueprint.hookExample}. Make it about the child's own life, and end with a small wondering question.`,
      maxSentences: SENTENCE_BUDGET.HOOK,
      boardDescription: `a title card: ${lessonTitle}`,
      board: { kind: "title_card", title: lessonTitle, emoji: "🤔" },
      endBy: "asking",
    });
  }

  const explainBeats = buildExplainBeats(conceptTag, explanations, blueprint, skipOpeningEntries);
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
      beats.push(...buildItemSegment(item, mode, segmentIndex, beats.length));
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
    goal: "Wrap this idea up in one warm sentence and say what you'll look at next.",
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

function buildLessonGoalsBeat(openingRows: BankRow[], orderedTags: string[], descriptions: Map<string, string>, lessonTitle: string): Beat | null {
  const primary = [...openingRows].sort((a, b) => a.source.localeCompare(b.source))[0];
  if (!primary) return null;
  const payload = payloadOf(primary);
  const transcript = typeof payload.transcriptExcerpt === "string" ? payload.transcriptExcerpt : "";
  const goals = orderedTags
    .map((tag) => descriptions.get(tag))
    .filter((d): d is string => !!d)
    .slice(0, 4);
  return framingBeat(
    0,
    "lesson-goals",
    "LESSON_GOALS",
    `Tell the child what this whole lesson is about, in a child's terms — the way the real teacher opened it: ` +
      `working with big numbers up to 100,000 (${goals.join("; ")}). Make it sound like an adventure ahead, not a syllabus.`,
    "pausing",
    { kind: "title_card", title: lessonTitle, emoji: "📚" },
    transcript ? excerptForReference(transcript) : undefined,
  );
}

/**
 * Cuts the concatenated concept beats into sittings and wraps each in its
 * framing: CHAT_OPENER → (LESSON_GOALS | RECAP) → work → BREAK_CHAT → work
 * → CLOSE_SESSION. Estimates come from beatRegistry.ts.
 */
function assembleSessions(
  work: Beat[],
  lessonGoals: Beat | null,
  descriptions: Map<string, string>,
  lessonTitle: string,
): { beats: Beat[]; sessions: SessionPlan[] } {
  // First: cut the work into per-session slices by estimated teaching time.
  const slices: Beat[][] = [];
  let current: Beat[] = [];
  let currentSeconds = 0;
  for (let i = 0; i < work.length; i += 1) {
    const beat = work[i];
    const estimate = beatSpec(beat.type).estimateSeconds;
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
    if (sessionIndex === 0 && lessonGoals) {
      beats.push(lessonGoals);
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
      teachingSeconds += beatSpec(beat.type).estimateSeconds;
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
      estimatedSeconds: beats.slice(firstBeat, lastBeat + 1).reduce((sum, b) => sum + beatSpec(b.type).estimateSeconds, 0),
      conceptTags,
    });
  });

  return { beats, sessions };
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
  const lessonGoals = buildLessonGoalsBeat(openingRows, orderedTags, descriptions, lessonTitle);

  const work: Beat[] = [];
  blueprint.concepts.forEach((conceptBlueprint, conceptIndex) => {
    const conceptRows = teachableRows.filter((row) => row.concept_tag === conceptBlueprint.conceptTag);
    const conceptBeats = buildConceptBeats(
      conceptBlueprint,
      descriptions.get(conceptBlueprint.conceptTag) ?? null,
      conceptRows,
      // LESSON_GOALS already delivers the welcome + goals; don't have the
      // first concept's explain run say them again.
      conceptIndex === 0 && lessonGoals !== null,
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
