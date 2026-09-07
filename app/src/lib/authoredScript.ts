/**
 * The AUTHORED script: Zara's original lesson, generated from the design
 * file (scripts/author-script.ts) and stored at
 * src/data/lessons/authored/<subject>-<grade>-<lesson>.json.
 *
 * This replaces the transcript-derived speech for the concepts it covers:
 * the words are original (distance-guarded against the recorded teacher),
 * the examples are the official ones, and every number name comes from
 * sinhalaNumberName. The same approved:false review gate as everything
 * else — the builder ignores an unapproved file, so nothing a child hears
 * changes until a human has read docs/review/session-1-original.md.
 */
import type { Beat, BeatBoardAction } from "@/lib/lessonOrchestrator";
import type { DesignConceptTag } from "@/lib/lessonDesign";

export type AuthoredBeatType =
  | "LESSON_GOALS"
  | "HOOK"
  | "EXPLAIN"
  | "SOFT_CHECK"
  | "ASK"
  | "SHOW_BOARD"
  | "REVEAL_PART"
  | "TRANSITION"
  | "CHECK_MY_WORK";

export type AuthoredBoardIntent =
  | { kind: "none" }
  | { kind: "title"; title: string; emoji?: string }
  | { kind: "text"; text: string }
  | { kind: "abacus"; digits: number[]; animate?: boolean; startEmpty?: boolean }
  | { kind: "abacus_add"; rod: number; count: number }
  | { kind: "exercise"; itemId: string };

/**
 * The welcome-and-preview beats belong to no teachable concept — they are
 * the lesson's own opening, so they carry the same tag the transcript's
 * 00:00–03:00 segment does (lessonScriptBuilder.LESSON_OPENING_CONCEPT).
 */
export const AUTHORED_OPENING_CONCEPT = "lessonOpening";

export type AuthoredConceptTag = DesignConceptTag | typeof AUTHORED_OPENING_CONCEPT;

export interface AuthoredBeat {
  id: string;
  conceptTag: AuthoredConceptTag;
  type: AuthoredBeatType;
  /**
   * The authored line WITH its {number:N} markers — the reviewable source.
   * spokenText is derived from it, so the joiner can be corrected and every
   * line re-rendered without a model (scripts/apply-review-edits.ts).
   */
  sourceText: string;
  /** Final Sinhala — number names already substituted, {address} intact. */
  spokenText: string;
  /** Set when a human rewrote this line in review; the author never overwrites one. */
  humanEdited?: boolean;
  /** Every number spoken in this beat — the portal verifies an actor's re-recording says each one correctly. */
  numbers?: number[];
  /** True when the canonical wording came from the actor's own recording (see /portal). */
  actorRecorded?: boolean;
  pauseType: "RHETORICAL" | "SOFT_CHECK" | "ASK" | null;
  boardIntent: AuthoredBoardIntent;
  expectedAnswer?: string;
  answerChoices?: string[];
  /** Which guide පියවර this beat serves. */
  guideStep?: string;
  /** Printed textbook page in play, when one is. */
  textbookPage?: number;
  /** CHECK_MY_WORK: the deliberate error the child must find. */
  errorPlanted?: string;
  /** Distance-guard evidence, recorded per beat. */
  maxSimilarity: { jaccard: number; cosine: number | null; closest: string };
}

export interface AuthoredScriptFile {
  subject: string;
  grade: number;
  lesson: number;
  /** FALSE until a human has read the review doc. The builder ignores an unapproved file. */
  approved: boolean;
  model: string;
  generatedAt: string;
  /** Which sitting this file covers so far (grows as later sessions are authored). */
  sessionsAuthored: number[];
  /** The concepts whose beats are authored, in teaching order. */
  concepts: DesignConceptTag[];
  /** Chunk ledger ("concept:stepIndex") — a rerun resumes instead of re-billing accepted work. */
  completedChunks?: string[];
  /** Three original hook candidates per concept; index 0 is the one in use. */
  hookCandidates: Partial<Record<DesignConceptTag, string[]>>;
  /**
   * The EXPLANATORY analogy each concept teaches through — the everyday
   * thing the explanation itself leans on (placeValue4Digit reasons about
   * coins in a till). All distinct, never from C.
   */
  analogies: Partial<Record<DesignConceptTag, string>>;
  /**
   * The everyday thing the concept's HOOK opens on, which is a different
   * question from what the teaching then reasons through: session 1 opens
   * placeValue4Digit on the price of a school bag and goes on to explain
   * with coins in a till. Recorded separately so neither overwrites the
   * other when a hook is swapped.
   */
  hookAnalogy?: Partial<Record<DesignConceptTag, string>>;
  beats: AuthoredBeat[];
}

export function parseAuthoredScript(json: string | null): AuthoredScriptFile | null {
  if (json === null) return null;
  try {
    const parsed = JSON.parse(json) as AuthoredScriptFile;
    if (!parsed || !Array.isArray(parsed.beats) || !Array.isArray(parsed.concepts)) return null;
    return parsed;
  } catch (error) {
    console.error("[authoredScript] File is not valid JSON — IGNORING it:", error);
    return null;
  }
}

function boardFor(intent: AuthoredBoardIntent, lessonTitle: string): BeatBoardAction {
  switch (intent.kind) {
    case "title":
      return { kind: "title_card", title: intent.title || lessonTitle, emoji: intent.emoji };
    case "text":
      return { kind: "text_card", text: intent.text };
    case "abacus":
      return { kind: "abacus_set", digits: intent.digits, animate: intent.animate ?? false, startEmpty: intent.startEmpty };
    case "abacus_add":
      return { kind: "abacus_add_bead", rod: intent.rod, count: intent.count };
    case "exercise":
      return { kind: "stage_item", itemId: intent.itemId };
    default:
      return { kind: "none" };
  }
}

function describeBoard(intent: AuthoredBoardIntent): string {
  switch (intent.kind) {
    case "title":
      return `a title card: ${intent.title}`;
    case "text":
      return `board text: ${intent.text.slice(0, 60)}`;
    case "abacus":
      return `the abacus showing [${intent.digits.join(", ")}]`;
    case "abacus_add":
      return `beads landing on rod ${intent.rod}`;
    case "exercise":
      return "a textbook exercise";
    default:
      return "whatever is already showing";
  }
}

/**
 * Authored beats → runtime beats, ready for session assembly. The runtime
 * treats these exactly like any other beat: same registry, same ladders,
 * same feedback. sessionIndex is stamped by the session packer afterwards.
 */
export function toRuntimeBeats(file: AuthoredScriptFile, lessonTitle: string): Beat[] {
  return file.beats.map((authored, index) => {
    const asking = authored.type === "ASK" || authored.type === "CHECK_MY_WORK" || authored.type === "HOOK" || authored.type === "SOFT_CHECK";
    return {
      id: authored.id,
      type: authored.type,
      conceptTag: authored.conceptTag,
      sessionIndex: 0,
      mode: null,
      itemId: authored.boardIntent.kind === "exercise" ? authored.boardIntent.itemId : null,
      segmentIndex: index,
      goal:
        authored.type === "CHECK_MY_WORK"
          ? `Zara worked this with a deliberate error (${authored.errorPlanted ?? "planted"}); the child must find it.`
          : `Authored beat (${authored.guideStep ?? authored.conceptTag}).`,
      maxSentences: 4,
      boardDescription: describeBoard(authored.boardIntent),
      board: boardFor(authored.boardIntent, lessonTitle),
      spokenText: authored.spokenText,
      expectedAnswer: authored.expectedAnswer,
      answerChoices: authored.answerChoices,
      endBy: asking && authored.pauseType !== "RHETORICAL" ? "asking" : "pausing",
    } as Beat;
  });
}
