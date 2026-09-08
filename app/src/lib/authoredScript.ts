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
import type { LessonComponent } from "@/data/lessons/lesson1-numbers";
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
  | "CHECK_MY_WORK"
  | "RESOLVE";

export type AuthoredBoardIntent =
  /**
   * INHERIT. The board keeps whatever the previous beat left on it. This
   * is the default and the runtime has always behaved this way — a beat
   * that says nothing about the board changes nothing about the board —
   * but "none" read as "blank" to everyone who reviewed the script, so the
   * review doc now prints what is inherited, and blanking has its own
   * word below.
   */
  | { kind: "none" }
  /** The ONLY way to blank the board on purpose. Legitimate at a concept boundary; a flash anywhere else. */
  | { kind: "clear" }
  | { kind: "title"; title: string; emoji?: string }
  /** `highlight` marks the one item currently being asked about. */
  | { kind: "text"; text: string; highlight?: string }
  | { kind: "abacus"; digits: number[]; animate?: boolean; startEmpty?: boolean }
  /**
   * Beads landing on a rod — or on several rods in one beat (`adds`), for
   * a line that names two places in one breath: "දහයස්ථානයට දෙකකුත්,
   * එකස්ථානයට එකකුත්". Rods already carrying beads are left alone.
   */
  | { kind: "abacus_add"; rod: number; count: number; adds?: Array<{ rod: number; count: number }> }
  | { kind: "exercise"; itemId: string }
  /**
   * One blank of a staged exercise, made active so the child answers it
   * through the board's own number pad. The closing questions use this:
   * an exercise nobody fills in is a picture, not practice.
   */
  | { kind: "blank"; itemId: string; rowIndex: number; field: string }
  /**
   * The digit picker, rendered directly rather than through a content_bank
   * row: the beats that use it need a specific set of digits on screen
   * while the child builds numbers from them.
   */
  | { kind: "digitPicker"; digits: number[]; instructions: string }
  /**
   * The number the child just built, written beneath the digit picker
   * with its Sinhala name — on top of the picker, not instead of it. The
   * digits come from the runtime (the last predicate-judged answer); the
   * script only says "show it here".
   */
  | { kind: "builtNumber" }
  /**
   * An expansion ("5 421 = ▢ + ▢ + ▢ + ▢"). Every part renders BLANK; the
   * values in `answers` are the key a later `reveal` writes in, never
   * something the board shows on its own.
   *
   * The field is called `answers` and not `parts` because a reviewer read
   * `parts: [5000, 400, 20, 1]` in the review doc as the finished sum on
   * the board before the child was asked for it. The renderer was always
   * right — boardFor blanks every cell — but a name that has to be traced
   * through two files to be understood is a name that will be misread again.
   */
  | { kind: "expansion"; number: number; answers: number[] }
  /** Reveals one part of an expansion (or any staged item's blank) — Zara writing the answer in. */
  | { kind: "reveal"; itemId: string; rowIndex: number; field: string; value: string };

/** The synthetic item id an `expansion` board stages under — no content_bank row behind it. */
export function expansionItemId(number: number): string {
  return `expansion:${number}`;
}

/** How the textbook prints a four-or-five-digit number: a thin space before the last three digits. */
export function textbookNumber(number: number): string {
  const digits = String(number);
  return digits.length > 3 ? `${digits.slice(0, -3)} ${digits.slice(-3)}` : digits;
}

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
      return { kind: "text_card", text: intent.text, highlight: intent.highlight };
    case "abacus":
      return { kind: "abacus_set", digits: intent.digits, animate: intent.animate ?? false, startEmpty: intent.startEmpty };
    case "abacus_add":
      return { kind: "abacus_add_bead", rod: intent.rod, count: intent.count, adds: intent.adds };
    case "exercise":
      return { kind: "stage_item", itemId: intent.itemId };
    case "blank":
      return { kind: "set_active_blank", itemId: intent.itemId, rowIndex: intent.rowIndex, field: intent.field };
    case "clear":
      return { kind: "clear" };
    case "builtNumber":
      return { kind: "built_number" };
    case "reveal":
      return { kind: "reveal_part", itemId: intent.itemId, rowIndex: intent.rowIndex, field: intent.field, value: intent.value };
    case "expansion":
      return {
        kind: "show_components",
        itemId: expansionItemId(intent.number),
        components: [
          {
            type: "ExpansionExercise",
            // Every cell blank: `answers` is the key for `reveal`, not display.
            props: { rows: [{ prompt: textbookNumber(intent.number), parts: intent.answers.map(() => null) }] },
          } as unknown as LessonComponent,
        ],
      };
    case "digitPicker":
      return {
        kind: "show_components",
        itemId: `digit-picker:${intent.digits.join("")}`,
        components: [
          {
            type: "DigitPickerPuzzle",
            props: {
              availableDigits: intent.digits,
              instructions: intent.instructions,
              exampleAnswer: "",
            },
          } as unknown as LessonComponent,
        ],
      };
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
      return intent.adds
        ? `beads landing on rods ${intent.adds.map((a) => `${a.rod} (+${a.count})`).join(", ")}`
        : `beads landing on rod ${intent.rod}`;
    case "exercise":
      return "a textbook exercise";
    case "blank":
      return `the exercise with row ${intent.rowIndex}'s ${intent.field} waiting to be filled in`;
    case "digitPicker":
      return `the digit picker showing ${intent.digits.join(", ")}`;
    case "clear":
      return "a cleared board";
    case "builtNumber":
      return "the number the child just built, with its name, under the digit picker";
    case "expansion":
      return `${textbookNumber(intent.number)} = ${intent.answers.map(() => "▢").join(" + ")}`;
    case "reveal":
      return `the answer ${intent.value} written into row ${intent.rowIndex}'s ${intent.field}`;
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
      itemId:
      authored.boardIntent.kind === "exercise" || authored.boardIntent.kind === "blank"
        ? authored.boardIntent.itemId
        : null,
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
