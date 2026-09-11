/**
 * Applies the native-speaker review to the authored script — offline.
 *
 *   npm run apply:review-edits            # apply, validate, rewrite the review doc
 *   npm run apply:review-edits -- --dry   # print everything, write nothing
 *
 * NO model is called. Every change comes from a review file, from the
 * deterministic number renderer, or from the speech rules — the point of
 * the exercise is that a human's corrections land verbatim and the machine
 * only does the parts that must be mechanical.
 *
 * Two rounds, applied in order (the second overrides the first wherever
 * they touch the same beat):
 *
 *   1. docs/review/session-1-edits.json          native-speaker pass
 *   2. docs/review/gemini-review-decisions.json  second pass + decisions
 *   3. docs/review/session-1-corrections.json    factual corrections
 *
 * The script also performs the one-time format migration this review
 * forced: beats gain a `sourceText` holding the line WITH its {number:N}
 * markers. Session 1 stored only the rendered words, so the joiner bug the
 * review found ("නවය ට එක ක්" for "නවයට එකක්") could not be fixed by
 * re-rendering — there was nothing left to re-render from. Markers are
 * recovered here from each beat's `numbers` array, and every line is
 * regenerated through renderNumberMarkers from then on.
 */
import type { PhraseRubric } from "../src/lib/authoredScript";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { renderNumberMarkers, sinhalaNumberName } from "../src/lib/sinhalaNumber";
import { charNgrams, jaccard, sentencesOf, stripOfficial, MAX_JACCARD } from "../src/lib/scriptDistance";
import { checkSpeechRules, formatSpeechFindings, type SpeechBeat } from "../src/lib/speechRules";
import { VOCABULARY_INTRODUCED_BY, type LessonDesign } from "../src/lib/lessonDesign";
import { LESSON_1_NUMBERS_STEPS } from "../src/data/lessons/lesson1-numbers";
import { renderReviewDoc } from "../src/lib/reviewDoc";
import {
  AUTHORED_OPENING_CONCEPT,
  type AuthoredBeat,
  type AuthoredBoardIntent,
  type AuthoredScriptFile,
} from "../src/lib/authoredScript";

const DRY = process.argv.includes("--dry");
const ROOT = process.cwd();
const SCRIPT_PATH = path.join(ROOT, "src/data/lessons/authored/maths-5-1.json");
const DESIGN_PATH = path.join(ROOT, "..", "docs", "design", "maths-5-1.json");
const REVIEW_DOC_PATH = path.join(ROOT, "..", "docs", "review", "session-1-original.md");
const EDITS_PATH = path.join(ROOT, "..", "docs", "review", "session-1-edits.json");
const DECISIONS_PATH = path.join(ROOT, "..", "docs", "review", "gemini-review-decisions.json");
const CORRECTIONS_PATH = path.join(ROOT, "..", "docs", "review", "session-1-corrections.json");
const TRANSCRIPT_PATH = path.join(ROOT, "src/data/lessons/lesson1-teaching-plan-full.json");

/** The one beat whose wording round 2 left as a choice between two variants. */
const PENDING_CHOICE = "authored:placeValue4Digit:33";

function heading(text: string): void {
  console.log(`\n${"═".repeat(78)}\n${text}\n${"═".repeat(78)}`);
}

// --- review file shapes ---------------------------------------------------

interface EditsFile {
  openingBeats: {
    insertBefore: string;
    beats: Array<{
      id: string;
      type: string;
      pause: string;
      spokenText: string;
      board: AuthoredBoardIntent;
    }>;
  };
  hookSwap: Record<string, string>;
  replacements: Record<string, string>;
}

interface BeatRewrite {
  text?: string;
  type?: string;
  pause?: string;
  expectedAnswer?: string;
  dropExpectedAnswer?: boolean;
  board?: AuthoredBoardIntent;
  why?: string;
}

interface InsertedBeat {
  after?: string;
  before?: string;
  beat: {
    id: string;
    type: string;
    pause: string;
    spokenText: string;
    board: AuthoredBoardIntent;
    expectedAnswer?: string;
    /** The guide step the beat serves; the anchor's when absent. */
    guideStep?: string;
    why?: string;
  };
}

interface CorrectionsFile {
  hookSwap: Record<string, string>;
  softenToSoftCheck: Record<string, string>;
  dropExpectedAnswer: string[];
  hookInUse: Record<string, string>;
  hookAnalogy: Record<string, string>;
  /** Round 4: praise pulled out of the beat after a question. */
  neutralConfirmation: Record<string, string>;
  answerAssumption: Record<string, string>;
  conversationalRuns: { rewrite: Record<string, BeatRewrite>; remove: Array<{ id: string; why: string }> };
  ending: { rewrite: Record<string, BeatRewrite>; append: InsertedBeat[] };
  boardContinuity: { rewrite: Record<string, BeatRewrite>; insert: InsertedBeat[] };
  activitiesThatHappen: { rewrite: Record<string, BeatRewrite & { remove?: boolean }>; insert: InsertedBeat[] };
  /** Round 6: the question round 4 removed with the praise, put back. */
  restoredPrompt: { insert: InsertedBeat[] };
  /** Round 7: board continuity, the read-back, the 1364 redundancy, the early answer. */
  visualContinuity: { rewrite: Record<string, BeatRewrite & { remove?: boolean }>; insert: InsertedBeat[] };
  /** Storyboard round: the accepted script notes from docs/storyboard/script-notes.md. */
  storyboard: { rewrite: Record<string, BeatRewrite> };
  /** Round 10: the textbook exercise the session skipped. */
  textbookTable: { insert: InsertedBeat[] };
  /** Round 10: how a phrase answer is judged, per beat. */
  phraseRubrics: Record<string, (PhraseRubric & { why?: string }) | string>;
  /** Chip-primary questions no longer ask the child to SAY it — "කියන්න හෝ තෝරන්න" / "හරි එක තෝරන්න". */
  chipWording?: Record<string, string>;
}

interface DecisionsFile {
  accepted: Record<string, string>;
  acceptedWithChange: Record<string, { text?: string; preferred?: string; fallback?: string; why: string }>;
  rejected: Record<string, { keep: string; why: string }>;
}

/** Review files carry $comment keys for the human; they are not beat ids. */
function beatEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record).filter(([key]) => key.startsWith("authored:"));
}

// --- marker recovery ------------------------------------------------------

const SINHALA_CHAR = /[඀-෿]/u;
/** Endings that bind to a number name, so the name's edge is still its edge. */
const BOUND_ENDINGS = ["කුත්", "කින්", "ක්ම", "ටම", "ක්", "ෙන්", "ේ", "ෙ", "න්", "යි", "ට", "ක", "ම"];

/**
 * Is `text` at `end` a real word boundary for a number name? Either the
 * next character is not Sinhala at all, or what follows is one of the case
 * endings that attach to numbers — "පහෙන්" and "විස්සයි" are still the
 * names පහ and විස්ස wearing a suffix, while "එකතු" and "එකසිය" are other
 * words that merely begin the same way.
 */
function endsCleanly(text: string, end: number): boolean {
  const rest = text.slice(end);
  if (rest === "" || !SINHALA_CHAR.test(rest[0]!)) return true;
  return BOUND_ENDINGS.some((ending) => rest.startsWith(ending));
}

function startsCleanly(text: string, start: number): boolean {
  return start === 0 || !SINHALA_CHAR.test(text[start - 1]!);
}

/**
 * Rebuilds the marker form of a line that was stored already-rendered:
 * each value in `numbers`, in order, becomes a {number:N} marker again.
 * Throws rather than guessing — a wrong marker would change what a child
 * hears, and there are only 105 lines to get right.
 */
function recoverSourceText(spokenText: string, numbers: number[]): string {
  let text = spokenText;
  for (const value of numbers) {
    const name = sinhalaNumberName(value);
    let from = 0;
    let placed = false;
    for (;;) {
      const at = text.indexOf(name, from);
      if (at === -1) break;
      if (startsCleanly(text, at) && endsCleanly(text, at + name.length)) {
        text = `${text.slice(0, at)}{number:${value}}${text.slice(at + name.length)}`;
        placed = true;
        break;
      }
      from = at + 1;
    }
    assert.ok(placed, `could not place {number:${value}} ("${name}") in: ${spokenText}`);
  }
  return text;
}

// --- distance -------------------------------------------------------------

function textbookVerbatim(): string[] {
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(LESSON_1_NUMBERS_STEPS);
  return strings.filter((text) => text.length >= 8);
}

interface CorpusEntry {
  sentence: string;
  grams: Set<string>;
}

async function buildCorpus(verbatim: string[]): Promise<CorpusEntry[]> {
  const plan = JSON.parse(await readFile(TRANSCRIPT_PATH, "utf8")) as {
    segments: Array<{ fullTranscript: string }>;
  };
  const sentences = [
    ...new Set(
      plan.segments
        .flatMap((segment) => sentencesOf(segment.fullTranscript))
        .map((sentence) => sentence.trim())
        .filter((sentence) => stripOfficial(sentence, verbatim).length >= 12),
    ),
  ];
  return sentences.map((sentence) => ({ sentence, grams: charNgrams(stripOfficial(sentence, verbatim)) }));
}

/**
 * Surface distance from the recorded teacher, recomputed locally. Only the
 * jaccard half: cosine needs an embedding call, and this pass makes none —
 * so an edited line records `cosine: null` rather than carrying forward a
 * number that was measured against words no longer in the script.
 */
function distanceOf(spoken: string, corpus: CorpusEntry[], verbatim: string[]): AuthoredBeat["maxSimilarity"] {
  let worst = 0;
  let closest = "";
  for (const sentence of sentencesOf(spoken)) {
    const stripped = stripOfficial(sentence, verbatim);
    if (stripped.length < 20) continue;
    const grams = charNgrams(stripped);
    for (const entry of corpus) {
      const score = jaccard(grams, entry.grams);
      if (score > worst) {
        worst = score;
        closest = entry.sentence;
      }
    }
  }
  return { jaccard: worst, cosine: null, closest };
}

// --- main -----------------------------------------------------------------

async function main(): Promise<void> {
  const file = JSON.parse(await readFile(SCRIPT_PATH, "utf8")) as AuthoredScriptFile;
  const design = JSON.parse(await readFile(DESIGN_PATH, "utf8")) as LessonDesign;
  const edits = JSON.parse(await readFile(EDITS_PATH, "utf8")) as EditsFile;
  const decisions = JSON.parse(await readFile(DECISIONS_PATH, "utf8")) as DecisionsFile;
  const corrections = JSON.parse(await readFile(CORRECTIONS_PATH, "utf8")) as CorrectionsFile;
  const verbatim = textbookVerbatim();
  const corpus = await buildCorpus(verbatim);

  const originalSpoken = new Map(file.beats.map((beat) => [beat.id, beat.spokenText]));

  // 1. Recover the marker form of every stored line. Once the migration has
  //    run the file carries sourceText itself, so a re-run trusts what is
  //    there rather than reverse-engineering it a second time.
  const migrated = file.beats.every((beat) => typeof beat.sourceText === "string" && beat.sourceText.length > 0);
  console.log(migrated ? "sourceText: already present — using it." : "sourceText: recovering markers from numbers[] (one-time migration).");
  for (const beat of file.beats) {
    if (!beat.sourceText) beat.sourceText = recoverSourceText(beat.spokenText, beat.numbers ?? []);
  }

  // 2. THE JOINER DIFF — the effect of the fixed joiner alone, before any
  //    wording edit, so it can be read on its own.
  heading("1. JOINER FIX — every line re-rendered through the corrected joiner");
  const joinerChanged: string[] = [];
  for (const beat of file.beats) {
    const rendered = renderNumberMarkers(beat.sourceText).spoken;
    if (rendered === beat.spokenText) continue;
    joinerChanged.push(beat.id);
    console.log(`\n  ${beat.id}`);
    console.log(`    was: ${beat.spokenText}`);
    console.log(`    now: ${rendered}`);
  }
  const editedIds = new Set<string>([
    ...beatEntries(edits.hookSwap).map(([id]) => id),
    ...beatEntries(edits.replacements).map(([id]) => id),
    ...beatEntries(decisions.accepted).map(([id]) => id),
    ...beatEntries(decisions.acceptedWithChange).map(([id]) => id),
    ...beatEntries(corrections.hookSwap).map(([id]) => id),
  ]);
  const joinerOnly = joinerChanged.filter((id) => !editedIds.has(id));
  console.log(
    `\n  ${joinerChanged.length} beats change under the joiner fix; ` +
      `${joinerOnly.length} of them are NOT touched by either review file:`,
  );
  console.log(`    ${joinerOnly.map((id) => id.replace("authored:", "")).join(", ")}`);

  // 3. THE OPENING — file 1's seven beats, then file 2's accepted rewording.
  const humanEdited = new Set<string>();

  const openingBeats: AuthoredBeat[] = edits.openingBeats.beats.map((raw) => {
    const accepted = decisions.accepted[raw.id];
    const sourceText = accepted ?? raw.spokenText;
    const { spoken, numbers } = renderNumberMarkers(sourceText);
    humanEdited.add(raw.id);
    return {
      id: raw.id,
      conceptTag: AUTHORED_OPENING_CONCEPT,
      type: raw.type as AuthoredBeat["type"],
      sourceText,
      spokenText: spoken,
      numbers,
      humanEdited: true,
      pauseType: raw.pause === "—" ? null : (raw.pause as AuthoredBeat["pauseType"]),
      boardIntent: raw.board,
      guideStep: "Lesson opening: welcome the child and preview what this lesson covers.",
      maxSimilarity: distanceOf(spoken, corpus, verbatim),
    };
  });

  // Re-runnable: an opening already applied is rebuilt in place rather than
  // stacked on top of itself.
  const taught = file.beats.filter((beat) => beat.conceptTag !== AUTHORED_OPENING_CONCEPT);
  const insertAt = taught.findIndex((beat) => beat.id === edits.openingBeats.insertBefore);
  assert.ok(insertAt !== -1, `insertBefore ${edits.openingBeats.insertBefore} not found`);
  assert.equal(insertAt, 0, "the opening must go at the very front of the script");
  file.beats = [...openingBeats, ...taught];
  const byId = new Map(file.beats.map((beat) => [beat.id, beat]));

  // 4. REPLACEMENTS — round 1 then round 2, second wins on a shared beat.
  const applied: Array<{ id: string; from: string; source: string }> = [];
  // Round 4 folds four answer beats into the questions above them, so an
  // earlier round's replacement can legitimately point at a beat that no
  // longer exists. Skipping is right ONLY for those; any other unknown id
  // is a typo in a review file and must still fail loudly.
  const removedLater = new Set<string>([
    ...corrections.conversationalRuns.remove.map((entry) => entry.id),
    ...Object.entries(corrections.activitiesThatHappen.rewrite)
      .filter(([, rewrite]) => rewrite.remove)
      .map(([id]) => id),
    ...Object.entries(corrections.visualContinuity.rewrite)
      .filter(([, rewrite]) => rewrite.remove)
      .map(([id]) => id),
  ]);

  /**
   * Beats round 4 re-types. It runs last and wins, so round 3's softening
   * must not fight it — on a re-run the beat is already the type round 4
   * chose, and asserting "this is not an ASK" would be the applier
   * arguing with its own later decision.
   */
  const retypedByRound4 = new Set<string>([
    ...beatEntries(corrections.neutralConfirmation).map(([id]) => id),
    ...Object.keys(corrections.conversationalRuns.rewrite).filter((id) => id.startsWith("authored:")),
    ...Object.keys(corrections.ending.rewrite).filter((id) => id.startsWith("authored:")),
    ...Object.keys(corrections.visualContinuity.rewrite).filter((id) => id.startsWith("authored:")),
    ...Object.keys(corrections.storyboard.rewrite).filter((id) => id.startsWith("authored:")),
  ]);

  const apply = (id: string, sourceText: string, source: string): void => {
    const beat = byId.get(id);
    if (!beat && removedLater.has(id)) return;
    assert.ok(beat, `replacement targets unknown beat ${id}`);
    applied.push({ id, from: source, source: sourceText });
    beat.sourceText = sourceText;
    humanEdited.add(id);
  };

  for (const [id, text] of beatEntries(edits.hookSwap)) apply(id, text, "file 1 hookSwap");
  for (const [id, text] of beatEntries(edits.replacements)) apply(id, text, "file 1 replacements");
  for (const [id, text] of beatEntries(decisions.accepted)) {
    // The opening's own accepted lines are already in place — the opening
    // beats are built from them above, not patched afterwards.
    if (id.startsWith("authored:opening:")) continue;
    if (removedLater.has(id)) continue;
    assert.ok(byId.has(id), `round 2 accepted an unknown beat ${id}`);
    apply(id, text, "file 2 accepted");
  }

  // placeValue4Digit:33 picks between two wordings on whether the guide
  // term it wants is available yet. Decided from the script itself: a term
  // is "introduced" at the first beat that says it.
  let choiceNote = "";
  for (const [id, entry] of beatEntries(decisions.acceptedWithChange)) {
    if (entry.text) {
      apply(id, entry.text, "file 2 acceptedWithChange");
      continue;
    }
    assert.equal(id, PENDING_CHOICE, `unexpected preferred/fallback entry on ${id}`);
    const term = "ස්ථානීය අගය";
    const introducedAt = file.beats.findIndex(
      (beat) => beat.id !== id && renderNumberMarkers(beat.sourceText).spoken.includes(term),
    );
    const targetAt = file.beats.findIndex((beat) => beat.id === id);
    const allowed = introducedAt !== -1 && introducedAt <= targetAt;
    choiceNote =
      `  term "${term}" is introduced by ${introducedAt === -1 ? "no beat" : file.beats[introducedAt]!.id} ` +
      `(index ${introducedAt}); ${id} sits at index ${targetAt}.\n` +
      `  → the vocabulary gate ${allowed ? "ALLOWS" : "FORBIDS"} it here, so using "${allowed ? "preferred" : "fallback"}".\n` +
      `  concept gate: ${term} belongs to ${VOCABULARY_INTRODUCED_BY[term]}, which is this beat's own concept — ` +
      `it is the guide-order gate, not the concept gate, that decides.`;
    apply(id, (allowed ? entry.preferred : entry.fallback)!, `file 2 acceptedWithChange (${allowed ? "preferred" : "fallback"})`);
  }

  // Round 3 — factual corrections, last word over both reviews.
  for (const [id, text] of beatEntries(corrections.hookSwap)) apply(id, text, "file 3 corrections");

  // ASK → SOFT_CHECK. The words do not change; what changes is whether the
  // lesson stops and judges the child on them.
  const softened: Array<{ id: string; why: string }> = [];
  for (const [id, why] of beatEntries(corrections.softenToSoftCheck)) {
    const beat = byId.get(id);
    if (!beat && removedLater.has(id)) continue;
    assert.ok(beat, `softenToSoftCheck targets unknown beat ${id}`);
    if (retypedByRound4.has(id)) {
      softened.push({ id, why: `${why} (superseded by round 4)` });
      continue;
    }
    // Re-runnable: already softened is the intended end state, anything
    // else means this list is pointing at the wrong beat.
    assert.ok(
      beat.type === "ASK" || beat.type === "SOFT_CHECK",
      `${id} is ${beat.type}, not an ASK — refusing to soften it`,
    );
    beat.type = "SOFT_CHECK";
    beat.pauseType = "SOFT_CHECK";
    if (corrections.dropExpectedAnswer.includes(id)) delete beat.expectedAnswer;
    humanEdited.add(id);
    softened.push({ id, why });
  }
  for (const [tag, hook] of Object.entries(corrections.hookInUse)) {
    if (tag.startsWith("$")) continue;
    const candidates = file.hookCandidates[tag as keyof typeof file.hookCandidates];
    if (!candidates) continue;
    // hookCandidates[0] is by definition the hook in use, so a corrected
    // hook goes to the front; the generated ones it displaces are kept,
    // deduplicated, as the record of what was considered.
    file.hookCandidates[tag as keyof typeof file.hookCandidates] = [
      hook,
      ...candidates.filter((candidate) => candidate !== hook),
    ];
  }
  // ---- ROUND 4: structural flow ----------------------------------------
  //
  // The words already passed review; what follows fixes what the SHAPE of
  // the script assumed about the child. Applied after every wording round,
  // because several of these rewrite lines earlier rounds had accepted.
  const structural: Array<{ id: string; what: string; why: string }> = [];

  const applyRewrite = (id: string, rewrite: BeatRewrite, why: string): void => {
    const beat = byId.get(id);
    // A later round may have removed this beat (round 7 deletes :24 and
    // :27-:29, which round 4 had rewritten). On a re-run the file already
    // lacks them, and a rewrite with nothing left to rewrite is done —
    // but any OTHER unknown id is a typo in a review file and still fails.
    if (!beat && removedLater.has(id)) return;
    assert.ok(beat, `round 4 targets unknown beat ${id}`);
    const changes: string[] = [];
    if (rewrite.text !== undefined && beat.sourceText !== rewrite.text) {
      beat.sourceText = rewrite.text;
      changes.push("words");
    }
    if (rewrite.type && beat.type !== rewrite.type) {
      beat.type = rewrite.type as AuthoredBeat["type"];
      changes.push(`type→${rewrite.type}`);
    }
    if (rewrite.pause !== undefined) {
      const pause = rewrite.pause === "—" ? null : (rewrite.pause as AuthoredBeat["pauseType"]);
      if (beat.pauseType !== pause) {
        beat.pauseType = pause;
        changes.push(`pause→${pause ?? "none"}`);
      }
    }
    if (rewrite.expectedAnswer !== undefined && beat.expectedAnswer !== rewrite.expectedAnswer) {
      beat.expectedAnswer = rewrite.expectedAnswer;
      changes.push("expects");
    }
    if (rewrite.dropExpectedAnswer && beat.expectedAnswer !== undefined) {
      delete beat.expectedAnswer;
      changes.push("expects dropped");
    }
    if (rewrite.board) {
      beat.boardIntent = rewrite.board;
      changes.push("board");
    }
    if (changes.length > 0) {
      humanEdited.add(id);
      structural.push({ id, what: changes.join(", "), why: rewrite.why ?? why });
    }
  };

  // 1. Praise out of the beat after a question. A statement is not a
  //    question, so a beat that stops asking stops waiting too.
  for (const [id, text] of beatEntries(corrections.neutralConfirmation)) {
    if (removedLater.has(id)) continue;
    const beat = byId.get(id);
    assert.ok(beat, `neutralConfirmation targets unknown beat ${id}`);
    const stillAsks = /[?？]/u.test(text);
    applyRewrite(
      id,
      {
        text,
        ...(stillAsks ? {} : { type: "EXPLAIN", pause: "—", dropExpectedAnswer: true }),
      },
      "neutral confirmation — the runtime supplies the verdict",
    );
  }

  // 3. Numbers no longer asserted as though the child had said them.
  for (const [id, text] of beatEntries(corrections.answerAssumption)) {
    if (removedLater.has(id)) continue;
    const beat = byId.get(id);
    assert.ok(beat, `answerAssumption targets unknown beat ${id}`);
    // Round 2 left :28 paused RHETORICAL for a tag the new wording drops.
    const keepsTag = /(?:නේද|හරිද|එහෙනම්)\s*\?\s*$/u.test(text.replace(/\{address\}/gu, "").trim());
    applyRewrite(
      id,
      { text, ...(keepsTag ? {} : { pause: "—" }) },
      "re-framed as an example — the child's own answer was never known here",
    );
  }

  // 4. The interrogation runs become a conversation.
  for (const [id, rewrite] of Object.entries(corrections.conversationalRuns.rewrite)) {
    if (!id.startsWith("authored:")) continue;
    applyRewrite(id, rewrite, "alternating run");
  }
  for (const removal of corrections.conversationalRuns.remove) {
    const before = file.beats.length;
    file.beats = file.beats.filter((beat) => beat.id !== removal.id);
    if (file.beats.length < before) structural.push({ id: removal.id, what: "REMOVED", why: removal.why });
    byId.delete(removal.id);
  }

  // 6. A real ending: the exercise is worked, not just displayed.
  for (const [id, rewrite] of Object.entries(corrections.ending.rewrite)) {
    if (!id.startsWith("authored:")) continue;
    applyRewrite(id, rewrite, "ending");
  }
  /** Inserts one beat before/after an anchor, or updates it if already there. */
  const insertBeat = (addition: InsertedBeat, label: string): void => {
    if (byId.has(addition.beat.id)) {
      applyRewrite(
        addition.beat.id,
        {
          text: addition.beat.spokenText,
          type: addition.beat.type,
          pause: addition.beat.pause,
          board: addition.beat.board,
          ...(addition.beat.expectedAnswer !== undefined
            ? { expectedAnswer: addition.beat.expectedAnswer }
            : { dropExpectedAnswer: true }),
        },
        addition.beat.why ?? label,
      );
      return;
    }
    const anchorId = addition.after ?? addition.before!;
    const anchorIndex = file.beats.findIndex((beat) => beat.id === anchorId);
    assert.ok(anchorIndex !== -1, `insert anchor ${anchorId} not found`);
    const template = file.beats[anchorIndex]!;
    const created: AuthoredBeat = {
      id: addition.beat.id,
      conceptTag: template.conceptTag,
      type: addition.beat.type as AuthoredBeat["type"],
      sourceText: addition.beat.spokenText,
      spokenText: "",
      numbers: [],
      humanEdited: true,
      pauseType: addition.beat.pause === "—" ? null : (addition.beat.pause as AuthoredBeat["pauseType"]),
      boardIntent: addition.beat.board,
      expectedAnswer: addition.beat.expectedAnswer,
      guideStep: addition.beat.guideStep ?? template.guideStep,
      maxSimilarity: { jaccard: 0, cosine: null, closest: "" },
    };
    file.beats.splice(addition.after ? anchorIndex + 1 : anchorIndex, 0, created);
    byId.set(created.id, created);
    humanEdited.add(created.id);
    structural.push({ id: created.id, what: "ADDED", why: addition.beat.why ?? label });
  };

  for (const addition of corrections.ending.append) {
    if (byId.has(addition.beat.id)) {
      // Already added by an earlier run — UPDATE it rather than skip, or
      // an edit to this file would silently never reach the beat.
      applyRewrite(
        addition.beat.id,
        {
          text: addition.beat.spokenText,
          type: addition.beat.type,
          pause: addition.beat.pause,
          board: addition.beat.board,
          ...(addition.beat.expectedAnswer !== undefined
            ? { expectedAnswer: addition.beat.expectedAnswer }
            : { dropExpectedAnswer: true }),
        },
        addition.beat.why ?? "ending",
      );
      continue;
    }
    const anchorIndex = file.beats.findIndex((beat) => beat.id === addition.after);
    assert.ok(anchorIndex !== -1, `append anchor ${addition.after} not found`);
    const template = file.beats[anchorIndex]!;
    const created: AuthoredBeat = {
      id: addition.beat.id,
      conceptTag: template.conceptTag,
      type: addition.beat.type as AuthoredBeat["type"],
      sourceText: addition.beat.spokenText,
      spokenText: "",
      numbers: [],
      humanEdited: true,
      pauseType: addition.beat.pause === "—" ? null : (addition.beat.pause as AuthoredBeat["pauseType"]),
      boardIntent: addition.beat.board,
      expectedAnswer: addition.beat.expectedAnswer,
      guideStep: template.guideStep,
      maxSimilarity: { jaccard: 0, cosine: null, closest: "" },
    };
    file.beats.splice(anchorIndex + 1, 0, created);
    byId.set(created.id, created);
    humanEdited.add(created.id);
    structural.push({ id: created.id, what: "ADDED", why: addition.beat.why ?? "ending" });
  }

  // ---- ROUND 5: board continuity and activities that happen -------------
  for (const [id, rewrite] of Object.entries(corrections.boardContinuity.rewrite)) {
    if (!id.startsWith("authored:")) continue;
    applyRewrite(id, rewrite, "board continuity");
  }
  for (const addition of corrections.boardContinuity.insert ?? []) insertBeat(addition, "board continuity");
  for (const [id, rewrite] of Object.entries(corrections.activitiesThatHappen.rewrite)) {
    if (!id.startsWith("authored:")) continue;
    if (rewrite.remove) {
      const before = file.beats.length;
      file.beats = file.beats.filter((beat) => beat.id !== id);
      if (file.beats.length < before) structural.push({ id, what: "REMOVED", why: rewrite.why ?? "" });
      byId.delete(id);
      continue;
    }
    applyRewrite(id, rewrite, "activity");
  }
  for (const addition of corrections.activitiesThatHappen.insert) insertBeat(addition, "activity");
  for (const addition of corrections.restoredPrompt.insert) insertBeat(addition, "restored prompt");

  // ---- ROUND 7: visual continuity ---------------------------------------
  for (const [id, rewrite] of Object.entries(corrections.visualContinuity.rewrite)) {
    if (!id.startsWith("authored:")) continue;
    if (rewrite.remove) {
      const before = file.beats.length;
      file.beats = file.beats.filter((beat) => beat.id !== id);
      if (file.beats.length < before) structural.push({ id, what: "REMOVED", why: rewrite.why ?? "" });
      byId.delete(id);
      continue;
    }
    applyRewrite(id, rewrite, "visual continuity");
  }
  for (const addition of corrections.visualContinuity.insert) insertBeat(addition, "visual continuity");

  // ---- STORYBOARD ROUND: the accepted script notes ------------------------
  for (const [id, rewrite] of Object.entries(corrections.storyboard.rewrite)) {
    if (!id.startsWith("authored:")) continue;
    applyRewrite(id, rewrite, "storyboard note");
  }

  // ---- ROUND 10: the textbook table the session skipped, and phrase rubrics
  for (const addition of corrections.textbookTable?.insert ?? []) insertBeat(addition, "textbook table");
  for (const [id, text] of Object.entries(corrections.chipWording ?? {})) {
    if (id === "$comment") continue;
    applyRewrite(id, { text }, "chip wording: the answer is tapped or said, never only said");
  }
  for (const [id, rubric] of Object.entries(corrections.phraseRubrics ?? {})) {
    if (!id.startsWith("authored:") || typeof rubric === "string") continue;
    const beat = byId.get(id);
    assert.ok(beat, `phrase rubric for a beat that does not exist: ${id}`);
    const { why, ...fields } = rubric;
    const before = JSON.stringify(beat.rubric ?? null);
    beat.rubric = fields;
    if (before !== JSON.stringify(fields)) structural.push({ id, what: "RUBRIC", why: why ?? "phrase rubric" });
  }

  heading("3. STRUCTURAL FLOW (round 4)");
  for (const change of structural) {
    console.log(`  ${change.id.replace("authored:", "").padEnd(26)} ${change.what.padEnd(28)} ${change.why}`);
  }
  console.log(`  ${structural.length} structural change(s); ${file.beats.length} beats now.`);

  // The hook's everyday subject, kept apart from analogies — that field
  // records what the TEACHING reasons through, and a hook swap must not
  // overwrite it.
  for (const [tag, analogy] of Object.entries(corrections.hookAnalogy)) {
    if (tag.startsWith("$")) continue;
    file.hookAnalogy = { ...file.hookAnalogy, [tag]: analogy };
  }

  for (const id of Object.keys(decisions.rejected)) {
    if (!id.startsWith("authored:")) continue;
    assert.ok(!humanEdited.has(id) || editedIds.has(id), `rejected beat ${id} must not be rewritten`);
  }

  heading("2. ASK → SOFT_CHECK");
  const askCount = file.beats.filter((beat) => beat.type === "ASK").length;
  const cmwCount = file.beats.filter((beat) => beat.type === "CHECK_MY_WORK").length;
  console.log(`  ${softened.length} of the script's judged questions are soft checks.`);
  console.log(
    `  waiting beats now: ASK ${askCount} + CHECK_MY_WORK ${cmwCount} = ${askCount + cmwCount}` +
      ` (before softening: ${askCount + softened.length} + ${cmwCount})`,
  );
  for (const { id, why } of softened) console.log(`    ${id.replace("authored:", "")}: ${why}`);
  console.log(`\n  kept as judged checkpoints:`);
  for (const beat of file.beats.filter((b) => b.type === "ASK" || b.type === "CHECK_MY_WORK")) {
    console.log(`    ${beat.id.replace("authored:", "")} [${beat.type}] expects ${beat.expectedAnswer ?? "—"}`);
  }

  heading("4. OPENING (as spoken)");
  for (const beat of openingBeats) {
    const from = decisions.accepted[beat.id] ? "file 2 accepted" : "file 1";
    console.log(`\n  ${beat.id}  [${beat.type} · pause ${beat.pauseType ?? "—"} · ${from}]`);
    console.log(`    ${renderNumberMarkers(beat.sourceText).spoken}`);
    console.log(`    board: ${JSON.stringify(beat.boardIntent)}`);
  }

  heading("5. placeValue4Digit:33 — preferred vs fallback");
  console.log(choiceNote);
  console.log(`\n  chosen: ${byId.get(PENDING_CHOICE)!.sourceText}`);

  // 5. Re-render everything from source, and refresh the distance evidence
  //    for any line whose words actually changed.
  for (const beat of file.beats) {
    const { spoken, numbers } = renderNumberMarkers(beat.sourceText);
    const before = originalSpoken.get(beat.id);
    beat.spokenText = spoken;
    beat.numbers = numbers;
    // expectedAnswer is compared to what the child SAYS (answersMatch is an
    // exact string compare), so a marker left in it can never match: the
    // generator wrote {number:1} for "එක" and the checkpoint could not be
    // passed by any answer a child could give.
    if (beat.expectedAnswer?.includes("{number:")) {
      beat.expectedAnswer = renderNumberMarkers(beat.expectedAnswer).spoken;
    }
    if (humanEdited.has(beat.id)) beat.humanEdited = true;
    // Jaccard is recomputed every run, not only when the words changed:
    // the measurement moves when stripOfficial does (a new canonical frame,
    // a widened lexeme rule), and evidence that silently describes an older
    // metric is worse than no evidence. Cosine is left as stored — it needs
    // an embedding call this pass does not make, and it is already null on
    // every line a human rewrote.
    const cosine = before === spoken ? beat.maxSimilarity?.cosine ?? null : null;
    beat.maxSimilarity = { ...distanceOf(spoken, corpus, verbatim), cosine };
  }

  // 6. SPEECH RULES across the whole script.
  heading("6. NEW VALIDATOR RULES — run across all beats");
  const speechBeats = (): SpeechBeat[] =>
    file.beats.map((beat) => ({
      id: beat.id,
      spokenText: beat.spokenText,
      sourceText: beat.sourceText,
      pauseType: beat.pauseType,
      type: beat.type,
      expectedAnswer: beat.expectedAnswer ?? null,
      conceptTag: beat.conceptTag,
      board: beat.boardIntent as { kind: string; text?: string; digits?: number[]; title?: string },
      numbers: beat.numbers,
    }));

  const before = checkSpeechRules(speechBeats());
  console.log(`  ${before.length} hit(s) after both review files are applied:`);
  console.log(before.length ? formatSpeechFindings(before) : "  (none)");

  const extraFixes = applyExtraFixes(file, humanEdited);
  if (extraFixes.length) {
    heading("7. EXTRA FIXES — hits neither review file covered");
    for (const fix of extraFixes) {
      console.log(`\n  ${fix.id}  (${fix.rule})`);
      console.log(`    was: ${fix.was}`);
      console.log(`    now: ${fix.now}`);
      console.log(`    why: ${fix.why}`);
    }
    for (const beat of file.beats) {
      const { spoken, numbers } = renderNumberMarkers(beat.sourceText);
      if (spoken !== beat.spokenText) beat.maxSimilarity = { ...distanceOf(spoken, corpus, verbatim), cosine: null };
      beat.spokenText = spoken;
      beat.numbers = numbers;
      if (humanEdited.has(beat.id)) beat.humanEdited = true;
    }
  }

  const after = checkSpeechRules(speechBeats());
  console.log(`\n  after the extra fixes: ${after.length} hit(s)`);
  if (after.length) console.log(formatSpeechFindings(after));

  // 7. Deterministic validation.
  heading("8. DETERMINISTIC VALIDATION");
  validate(file, originalSpoken);

  // 8. Approve.
  file.approved = after.length === 0;
  file.sessionsAuthored = [...new Set([...file.sessionsAuthored, 1])];

  heading("9. RESULT");
  const editedCount = file.beats.filter((beat) => beat.humanEdited).length;
  console.log(`  beats:        ${file.beats.length}`);
  console.log(`  humanEdited:  true ${editedCount} · absent ${file.beats.length - editedCount}`);
  console.log(`  approved:     ${file.approved}`);
  console.log(`  worst jaccard: ${Math.max(...file.beats.map((b) => b.maxSimilarity.jaccard)).toFixed(3)} (limit ${MAX_JACCARD})`);
  console.log(`  applied:      ${applied.length} replacements + ${openingBeats.length} new opening beats`);

  if (DRY) {
    console.log("\n  --dry: nothing written.");
    return;
  }
  await writeFile(SCRIPT_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await writeFile(REVIEW_DOC_PATH, renderReviewDoc(file, design), "utf8");
  console.log(`\n  wrote ${path.relative(ROOT, SCRIPT_PATH)}`);
  console.log(`  wrote ${path.relative(ROOT, REVIEW_DOC_PATH)}`);
}

/**
 * Hits the two review files did not reach. Each fix copies a decision the
 * reviewers already made elsewhere in the same script rather than inventing
 * wording — where that was not possible, the beat is left for the human and
 * reported instead.
 */
function applyExtraFixes(
  file: AuthoredScriptFile,
  humanEdited: Set<string>,
): Array<{ id: string; rule: string; was: string; now: string; why: string }> {
  const fixes: Array<{ id: string; rule: string; was: string; now: string; why: string }> = [];
  const byId = new Map(file.beats.map((beat) => [beat.id, beat]));

  const rewrite = (id: string, next: string, rule: string, why: string): void => {
    const beat = byId.get(id);
    // A beat an earlier round targeted may have been REMOVED by a later
    // one (round 4 folds four answer beats into the questions above them).
    // A fix with nothing left to fix is done, not broken.
    if (!beat) return;
    if (beat.sourceText === next) return;
    fixes.push({ id, rule, was: beat.sourceText, now: next, why });
    beat.sourceText = next;
    humanEdited.add(id);
  };

  // bannedInSpeech — නිරූපණය. Round 2 rewrote the සියයස්ථානය line (:49) to
  // drop it entirely: "පබළු {number:4}ක් නිසා අගය {number:400}යි". :47 is
  // that line's දහයස්ථානය twin and was never touched, so it takes the same
  // shape with its own numbers.
  rewrite(
    "authored:placeValue4Digit:47",
    "දහයස්ථානයේ පබළු {number:2}ක් නිසා අගය {number:20}යි.",
    "bannedInSpeech",
    'round 2 removed "නිරූපණය වන" from the identical සියයස්ථානය line (:49); this is the same edit on its twin.',
  );

  // bannedInSpeech — නිරූපණය as a verb. "නිරූපණය කරලා බලමු" needs the verb
  // form, not the participle: the script already says පෙන්වනවා / පෙන්වන
  // everywhere else, so the same stem gives පෙන්වලා.
  rewrite(
    "authored:placeValue4Digit:75",
    "අපි දැන් තවත් සංඛ්‍යාවක් ගණක රාමුවෙන් පෙන්වලා බලමු {address}.",
    "bannedInSpeech",
    'නිරූපණය → පෙන්වන, in the verb position the sentence needs (පෙන්වලා); the පෙන්ව- stem is the one the rest of the script uses.',
  );

  // rhetoricalMustEndWithTag — opening:1 keeps its reviewer-accepted words:
  // the mismatch is the pause type. Round 1 marked it RHETORICAL when it
  // ended on a tag; round 2's accepted rewording ends on a statement, so
  // there is no unanswered question left to pause after.
  const opening1 = byId.get("authored:opening:1");
  if (opening1 && opening1.pauseType === "RHETORICAL" && !/(?:නේද|හරිද|එහෙනම්)\s*\?\s*$/u.test(opening1.spokenText)) {
    fixes.push({
      id: opening1.id,
      rule: "rhetoricalMustEndWithTag",
      was: `pauseType RHETORICAL — "${opening1.spokenText}"`,
      now: "pauseType null — words unchanged",
      why:
        "round 1 set the pause when the line ended on its tag; round 2's accepted rewording moved the tag inland " +
        "and ends on a statement. Changing the pause keeps the reviewed Sinhala intact; rewriting the line would not.",
    });
    opening1.pauseType = null;
    humanEdited.add(opening1.id);
  }

  // sentence length — round 2's :33 rewording is right about the logic but
  // runs to 17 words in one breath, over the 14-word rule every other line
  // obeys. Split at the clause boundary, keeping the reviewer's own words.
  const b33 = byId.get(PENDING_CHOICE);
  if (b33 && longestSentence(b33.sourceText) > 14) {
    rewrite(
      PENDING_CHOICE,
      "පොත්වල මිල ගණන් තියෙන්නේ ඉලක්කම් හතරේ සංඛ්‍යාවල. ඒ ඉලක්කම් තියෙන තැන දන්නවා නම් අපිට ඒවා ලේසියෙන් කියවන්න පුළුවන්.",
      "sentenceLength (≤14 words)",
      "round 2's wording is 17 words in one sentence; both its variants are. Split at the නම් clause into 7 + 11 " +
        "words using the reviewer's own vocabulary. THIS IS THE ONE PLACE reviewed Sinhala was restructured — " +
        "the alternative is to keep round 1's shorter :33 and lose round 2's logic fix.",
    );
  }

  return fixes;
}

/** Longest sentence in a line, counting a {number:N} marker as one word. */
function longestSentence(sourceText: string): number {
  return Math.max(
    0,
    ...sentencesOf(sourceText.replace(/\{number:\d+\}/gu, "N")).map(
      (sentence) => sentence.split(/\s+/u).filter(Boolean).length,
    ),
  );
}

/** The guarantees that must hold whatever the reviews said. */
function validate(file: AuthoredScriptFile, originalSpoken: Map<string, string>): void {
  const pass = (label: string): void => console.log(`  PASS  ${label}`);

  for (const beat of file.beats) {
    const { spoken, numbers } = renderNumberMarkers(beat.sourceText);
    assert.equal(beat.spokenText, spoken, `${beat.id}: spokenText is not its rendered sourceText`);
    assert.deepEqual(beat.numbers, numbers, `${beat.id}: numbers do not match the markers`);
    for (const value of numbers) assert.doesNotThrow(() => sinhalaNumberName(value), `${beat.id}: ${value}`);
    assert.ok(!/\{number:/u.test(beat.spokenText), `${beat.id}: an unrendered marker survived`);
    assert.ok(!/\d/u.test(beat.spokenText), `${beat.id}: a bare numeral is in the spoken line`);
  }
  pass(`every {number:N} renders through sinhalaNumberName (${file.beats.length} beats)`);

  let longest = 0;
  for (const beat of file.beats) {
    for (const sentence of sentencesOf(beat.sourceText.replace(/\{number:\d+\}/gu, "N"))) {
      const words = sentence.split(/\s+/u).filter(Boolean).length;
      longest = Math.max(longest, words);
      assert.ok(words <= 14, `${beat.id}: ${words}-word sentence — "${sentence}"`);
    }
  }
  pass(`no sentence exceeds 14 words (longest: ${longest})`);

  for (const beat of file.beats) {
    if (beat.type !== "ASK" && beat.type !== "CHECK_MY_WORK") continue;
    assert.ok(beat.expectedAnswer, `${beat.id}: an ASK lost its expectedAnswer`);
  }
  for (const beat of file.beats) {
    assert.ok(
      !beat.expectedAnswer?.includes("{number:"),
      `${beat.id}: expectedAnswer still holds a marker — no spoken answer could ever match it`,
    );
  }
  pass(`every ASK / CHECK_MY_WORK declares expectedAnswer, and none holds an unrendered marker`);

  for (const beat of file.beats) {
    assert.ok(beat.boardIntent && typeof beat.boardIntent.kind === "string", `${beat.id}: lost its board`);
    const before = originalSpoken.get(beat.id);
    if (before === undefined) continue;
    assert.ok(beat.boardIntent.kind.length > 0, `${beat.id}: empty board kind`);
  }
  pass(`no beat lost its board`);

  // Vocabulary in guide order. Measured on sourceText, exactly as the
  // author's own gate is (authorGuards.validateSay): a term that only
  // appears once {number:100000} is rendered ("සියක් දහස") is the
  // deterministic NAME of a number, not the lesson introducing a term —
  // the opening may say "numbers up to 100 000" without teaching the
  // ten-thousands place.
  //
  // The opening previews the first concept, so it is gated at that
  // concept's position: readWrite4Digit's own words (සංඛ්‍යාව) are in
  // bounds there, anything from a later activity is not.
  const conceptOrder = file.concepts;
  const positionOf = (beat: AuthoredBeat): number =>
    beat.conceptTag === AUTHORED_OPENING_CONCEPT ? 0 : conceptOrder.indexOf(beat.conceptTag as (typeof conceptOrder)[number]);
  for (const [term, introducedBy] of Object.entries(VOCABULARY_INTRODUCED_BY)) {
    const introAt = conceptOrder.indexOf(introducedBy);
    if (introAt === -1) continue; // a later lesson's term; nothing here can be early for it
    for (const beat of file.beats) {
      if (!beat.sourceText.includes(term)) continue;
      assert.ok(
        positionOf(beat) >= introAt,
        `"${term}" is spoken in ${beat.id} (${beat.conceptTag}) but is introduced by ${introducedBy}`,
      );
    }
  }
  const unusedTerms = Object.entries(VOCABULARY_INTRODUCED_BY)
    .filter(([term, by]) => conceptOrder.includes(by) && !file.beats.some((beat) => beat.sourceText.includes(term)))
    .map(([term]) => term);
  pass(
    `vocabulary is introduced in guide order` +
      (unusedTerms.length ? ` (never spoken in this session: ${unusedTerms.join(", ")})` : ""),
  );

  // Distance from the recorded teacher. Reported, NOT enforced here: the
  // guard exists to stop a MODEL regurgitating her sentences, and every
  // line over the line below was written by the human reviewer — twice, to
  // remove a bookish word. :80 is the clearest case: replacing the banned
  // වටිනාකම with අගය is correct spoken Sinhala and lands on the only
  // phrasing the language offers, which is also hers. A human decides
  // whether that is reuse or just the language; the script does not.
  const worst = Math.max(...file.beats.map((beat) => beat.maxSimilarity.jaccard));
  const tooClose = file.beats.filter((beat) => beat.maxSimilarity.jaccard >= MAX_JACCARD);
  if (!tooClose.length) {
    pass(`every line stays clear of the recorded teacher (worst jaccard ${worst.toFixed(3)} < ${MAX_JACCARD})`);
  } else {
    console.log(`  WARN  ${tooClose.length} line(s) at or over jaccard ${MAX_JACCARD} — all of them human-edited:`);
    for (const beat of tooClose) {
      console.log(`\n    ${beat.id}  jaccard ${beat.maxSimilarity.jaccard.toFixed(3)}${beat.humanEdited ? " (human-edited)" : ""}`);
      console.log(`      ours: ${beat.spokenText}`);
      console.log(`      hers: ${beat.maxSimilarity.closest}`);
    }
    console.log(`\n    These need a human call — they are reported, not auto-changed.`);
  }

  const ids = file.beats.map((beat) => beat.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate beat id");
  pass(`beat ids are unique`);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
