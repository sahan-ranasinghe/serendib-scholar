/**
 * Spoken-register rules for anything Zara says.
 *
 * A generated lesson passes the author's guards (number names, sentence
 * length, vocabulary timing) and still reads like a translated textbook
 * rather than a teacher talking to one child. The three rules here are the
 * recurring patterns a native-speaker review found across session 1
 * (docs/review/gemini-review-decisions.json § newValidatorRules), turned
 * into code so the same drift cannot come back in a later lesson:
 *
 *   1. a rhetorical question must actually SOUND like one — it ends with a
 *      tag the child recognises as "no answer needed",
 *   2. bookish words that no adult says out loud are banned outright,
 *   3. once a guide term has been taught, the lesson keeps using it rather
 *      than sliding back to a plain paraphrase.
 *
 * They run in the dry run and the simulated session, and they gate
 * approval: scripts/apply-review-edits.ts refuses to set "approved": true
 * while any of them reports a hit.
 */

/** The minimum a checker needs to know about a beat. */
export interface SpeechBeat {
  id: string;
  /** Final Sinhala, {address} still a token. */
  spokenText: string;
  /** The same line with {number:N} markers, when the beat has one. */
  sourceText?: string;
  pauseType: "RHETORICAL" | "SOFT_CHECK" | "ASK" | null;
  /** Needed by the flow rules: what kind of beat this is, and whether it judges an answer. */
  type?: string;
  expectedAnswer?: string | null;
  conceptTag?: string;
  /** What this beat puts on the board, if anything — for board continuity. */
  board?: {
    kind: string;
    text?: string;
    digits?: number[];
    title?: string;
    /** expansion: the number being expanded (its parts render blank) */
    number?: number;
    /** expansion: the reveal key — stored, never displayed */
    answers?: number[];
    /** reveal */
    value?: string;
    /** abacus_add */
    rod?: number;
    count?: number;
    adds?: Array<{ rod: number; count: number }>;
  };
  /** Numbers this beat speaks, from its {number:N} markers. */
  numbers?: number[];
}

export type SpeechRule =
  | "rhetoricalMustEndWithTag"
  | "bannedInSpeech"
  | "termConsistencyAfterIntroduction"
  | "noVerdictAfterAQuestion"
  | "noAssumedAnswer"
  | "numberMustBeOnTheBoard"
  | "checkMyWorkMustResolve"
  | "announcedActivityMustHappen"
  | "clearIsAFlash"
  | "noClearInsideAnAskRun"
  | "answerShownBeforeAsked"
  | "boardDisplaysALaterAnswer";

export interface SpeechFinding {
  rule: SpeechRule;
  beatId: string;
  detail: string;
  /** The spoken form the review named, where it named one. */
  suggestion?: string;
}

// --- 1. rhetorical questions ---------------------------------------------

/**
 * The tags that mark a question as rhetorical in spoken Sinhala. A beat
 * paused RHETORICAL without one reads as a real question, so the child
 * waits, the silence ladder fires, and the lesson stalls on a line that
 * was never meant to be answered.
 */
const RHETORICAL_TAGS = ["නේද", "හරිද", "එහෙනම්"] as const;

/** "…නේද?" / "…ඕනේ නේද?" / "…හරිද?", allowing a vocative before the mark. */
const RHETORICAL_TAG_PATTERN = new RegExp(`(?:${RHETORICAL_TAGS.join("|")})\\s*\\?\\s*$`, "u");

function checkRhetorical(beat: SpeechBeat): SpeechFinding | null {
  if (beat.pauseType !== "RHETORICAL") return null;
  // The vocative sits between the tag and the question mark
  // ("…තියෙනවා නේද {address}?", "…පබළු පහයි නේද, {address}?"), so it is not
  // part of the tag — and neither is the comma that introduces it.
  const withoutAddress = beat.spokenText.replace(/[,\s]*\{address\}/gu, "").trim();
  if (RHETORICAL_TAG_PATTERN.test(withoutAddress)) return null;
  return {
    rule: "rhetoricalMustEndWithTag",
    beatId: beat.id,
    detail: `pause is RHETORICAL but the line does not end with ${RHETORICAL_TAGS.map((t) => `${t}?`).join(" / ")} — "${tail(withoutAddress)}"`,
    suggestion: "end the line with නේද? (or හරිද?), or give the beat a real pause type",
  };
}

function tail(text: string, size = 40): string {
  return text.length <= size ? text : `…${text.slice(-size)}`;
}

// --- 2. banned bookish words ---------------------------------------------

interface BannedWord {
  /** The written form to flag. */
  word: string;
  /** What a teacher says instead. */
  spoken: string;
  /** Official phrases the word is allowed inside (a printed table heading). */
  allowedWithin?: string[];
  /** Allowed in a beat that is teaching this term rather than just using it. */
  allowedWhenTeaching?: string;
}

/**
 * Every entry is a word the review found in session 1 and named a spoken
 * replacement for. The two exceptions are real: නිරූපිත appears in the
 * textbook's own table heading, and සංඛ්‍යාංකය is a guide term that has to
 * be said aloud in the beat that introduces it — it is only wrong as a
 * fancy way of pointing at digits.
 */
export const BANNED_IN_SPEECH: BannedWord[] = [
  { word: "ශබ්ද නගලා", spoken: "කියවලා" },
  { word: "නියෝජනය කරන", spoken: "පෙන්වන" },
  { word: "නිරූපණය", spoken: "පෙන්වන", allowedWithin: ["ඉලක්කමෙන් නිරූපිත අගය"] },
  { word: "ගොඩනගමු", spoken: "හදමු" },
  { word: "රැඳිලා", spoken: "තියෙන" },
  { word: "විස්තරිත ආකාරය", spoken: "විහිදුවා ලියනවා" },
  { word: "විස්තෘත ආකාරය", spoken: "විහිදුවා ලියනවා" },
  { word: "දිගහැරුම", spoken: "දිගහැරලා ලිව්වාම" },
  { word: "අබකසය", spoken: "ගණක රාමුව" },
  { word: "වටිනාකම", spoken: "අගය" },
  { word: "බැගින්", spoken: "the කින්/ක් form" },
  { word: "සංඛ්‍යාංක", spoken: "ඉලක්කම්", allowedWhenTeaching: "සංඛ්‍යාංකය" },
];

/**
 * "සහ" is correct Sinhala everywhere except between numbers being listed
 * aloud, where a teacher simply pauses. Detected on the marker text, so a
 * list is unambiguous: a සහ within a few characters of a {number:N}.
 */
const SPOKEN_LIST_AND = /\{number:\d+\}[^.?!]{0,12}සහ|සහ[^.?!]{0,12}\{number:\d+\}/u;

function checkBanned(beat: SpeechBeat): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  for (const entry of BANNED_IN_SPEECH) {
    if (!beat.spokenText.includes(entry.word)) continue;
    if (entry.allowedWithin?.some((phrase) => beat.spokenText.includes(phrase))) continue;
    if (entry.allowedWhenTeaching && beat.spokenText.includes(entry.allowedWhenTeaching)) continue;
    findings.push({
      rule: "bannedInSpeech",
      beatId: beat.id,
      detail: `"${entry.word}" is bookish`,
      suggestion: entry.spoken,
    });
  }
  if (SPOKEN_LIST_AND.test(beat.sourceText ?? beat.spokenText)) {
    findings.push({
      rule: "bannedInSpeech",
      beatId: beat.id,
      detail: '"සහ" inside a spoken list of numbers',
      suggestion: "drop it — a comma and a pause are how the list is read aloud",
    });
  }
  return findings;
}

// --- 4. no verdict in the beat after a question ---------------------------

/**
 * The runtime already decides whether the child was right.
 *
 * When a scripted beat that FOLLOWS a question opens with "නියමයි!" or
 * "හරියටම හරි", that praise is unconditional: it plays identically after a
 * correct answer, after a wrong one the child then retried, and after
 * silence that ended with Zara demonstrating the answer herself. A child
 * congratulated for being wrong learns that the praise means nothing.
 *
 * So the beat after a question states the answer NEUTRALLY — true in all
 * three cases — and the praise stays where it belongs, in the feedback
 * clip the planner chooses from the real answer.
 */
const VERDICT_WORDS = [
  "නියමයි",
  "හරියටම හරි",
  "හරිම දක්ෂයි",
  "හරිම අපූරුයි",
  "ශෝක්",
  "විශිෂ්ටයි",
  "හරිම පැහැදිලියි",
  "ඔයා කිව්වේ හරි",
  "ඔයා හරි",
];

/** A beat that stops and waits for the child to say something. */
function isQuestion(beat: SpeechBeat): boolean {
  return beat.type === "ASK" || beat.type === "SOFT_CHECK" || beat.type === "CHECK_MY_WORK";
}

/** The first sentence is where a verdict lands; later ones are commentary. */
function firstSentence(text: string): string {
  const match = /^[^.!?]*[.!?]?/u.exec(text.replace(/\{address\}/gu, "").trim());
  return match ? match[0] : text;
}

function checkVerdicts(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  beats.forEach((beat, index) => {
    const previous = beats[index - 1];
    if (!previous || !isQuestion(previous)) return;
    const opening = firstSentence(beat.spokenText);
    // "ඔව්" is a neutral opener after a SOFT_CHECK or a rhetorical tag —
    // nothing was judged there. After an ASK it agrees with an answer the
    // child may not have given: it plays unchanged after a wrong one.
    const judged = previous.type === "ASK" || previous.type === "CHECK_MY_WORK";
    if (judged && /^ඔව්/u.test(opening.trim())) {
      findings.push({
        rule: "noVerdictAfterAQuestion",
        beatId: beat.id,
        detail: `opens with "ඔව්" straight after ${previous.id}, a judged question — it presumes the child was right`,
        suggestion: "drop the ඔව්; state the answer",
      });
      return;
    }
    for (const verdict of VERDICT_WORDS) {
      if (!opening.includes(verdict)) continue;
      findings.push({
        rule: "noVerdictAfterAQuestion",
        beatId: beat.id,
        detail: `opens with "${verdict}" straight after ${previous.id} asked a question — this praise plays even when the child was wrong`,
        suggestion: "state the answer neutrally; the runtime supplies praise from the real answer",
      });
      break;
    }
  });
  return findings;
}

// --- 5. no answer assumed from an open-ended question ---------------------

/**
 * "Make any number you like from these digits" — then Zara says 1364 as
 * though the child had said it. Whatever she actually made, the lesson
 * carried on about a different number.
 *
 * A beat may not state a number that came from an OPEN-ENDED response (a
 * question with no expectedAnswer, or one that literally invites a choice
 * with "ඔයා කැමති") unless it is framed as an example.
 */
const OPEN_ENDED_MARKER = "ඔයා කැමති";
const EXAMPLE_FRAMES = ["උදාහරණයක්", "අපි හිතමු"];

function checkAssumedAnswers(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  beats.forEach((beat, index) => {
    const previous = beats[index - 1];
    if (!previous || !isQuestion(previous)) return;
    // "No expectedAnswer" alone is too broad: a SOFT_CHECK that ends on a
    // rhetorical tag ("…මතක හිටියා නේද?") is a confirmation, not an
    // invitation to produce a number, and the beat after it is Zara
    // choosing her own example. Only a question that actually asks the
    // child to make something can have its answer assumed.
    const invites =
      previous.spokenText.includes(OPEN_ENDED_MARKER) ||
      (!previous.expectedAnswer && !RHETORICAL_TAG_PATTERN.test(previous.spokenText.replace(/[,\s]*\{address\}/gu, "").trim()));
    if (!invites) return;
    if (beat.conceptTag && previous.conceptTag && beat.conceptTag !== previous.conceptTag) return;
    // Markers are the reliable signal that a NUMBER is being stated.
    const numbers = [...(beat.sourceText ?? "").matchAll(/\{number:(\d+)\}/gu)].map((m) => m[1]!);
    if (numbers.length === 0) return;
    if (EXAMPLE_FRAMES.some((frame) => beat.spokenText.includes(frame))) return;
    findings.push({
      rule: "noAssumedAnswer",
      beatId: beat.id,
      detail: `states ${numbers.join(", ")} after ${previous.id} let the child choose freely — the child may have said something else`,
      suggestion: "frame it as an example (උදාහරණයක් විදිහට / අපි හිතමු), or ask a question with one answer",
    });
  });
  return findings;
}

// --- 3. term consistency --------------------------------------------------

/**
 * Guide terms and the paraphrases that must stop once the term is taught.
 * The gate is deliberately one-directional: BEFORE its introducing beat a
 * paraphrase is the only correct choice (readWrite4Digit:17 must say
 * සියයේ තැන, because සියයස්ථානය belongs to the next activity), and after
 * it the term itself is.
 */
export const TERM_PARAPHRASES: Array<{ term: string; paraphrases: string[] }> = [
  { term: "සියයස්ථානය", paraphrases: ["සියයේ තැන", "සියයේ කූර"] },
  { term: "දහයස්ථානය", paraphrases: ["දහයේ තැන", "දහයේ කූර"] },
];

function checkTermConsistency(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  for (const { term, paraphrases } of TERM_PARAPHRASES) {
    const introducedAt = beats.findIndex((beat) => beat.spokenText.includes(term));
    if (introducedAt === -1) continue;
    beats.forEach((beat, index) => {
      if (index < introducedAt) return;
      for (const paraphrase of paraphrases) {
        if (!beat.spokenText.includes(paraphrase)) continue;
        findings.push({
          rule: "termConsistencyAfterIntroduction",
          beatId: beat.id,
          detail: `"${paraphrase}" after ${term} was introduced (${beats[introducedAt].id})`,
          suggestion: term,
        });
      }
    });
  }
  return findings;
}

// --- 6. every number spoken is a number visible ---------------------------

/**
 * BOARD CONTINUITY. Zara says "මේ සංඛ්‍යාව" and the board is blank, or she
 * names a number the child cannot see. A tutor at a whiteboard never does
 * this: what is being discussed is what is written up.
 *
 * The board is STATEFUL — a beat with {kind:"none"} inherits whatever the
 * last beat put up — so the check carries that state forward within a
 * concept and asks, of every number a beat speaks, whether it is on the
 * board now or put there by this very beat.
 */
const DEICTIC_PHRASES = ["මේ සංඛ්‍යාව", "මේ ඊළඟ", "මෙන්න මේ"];

/**
 * Boards whose content is a rendered component, not a string: the table,
 * an active blank, the digit picker. Something IS up — this check simply
 * cannot read what, so it does not pretend to.
 */
const OPAQUE_BOARDS = new Set(["exercise", "blank", "digitPicker", "expansion"]);

/**
 * What a board makes visible, INCLUDING what can be read off it.
 *
 * An abacus showing 5 4 2 1 is showing 5421, its four digits, and the
 * place values those digits stand for — that is the entire point of the
 * apparatus, and a lesson about it necessarily says "හාරසියය" while
 * pointing at a 4. Requiring the literal string "400" on the board would
 * flag the lesson for teaching place value correctly.
 */
/** Board kinds that draw ON the current board rather than replacing it. */
const OVERLAY_BOARDS = new Set(["none", "builtNumber", "reveal", "abacus_add"]);

function numbersOnBoard(board: SpeechBeat["board"]): Set<string> {
  const shown = new Set<string>();
  if (!board) return shown;
  if (board.number !== undefined) {
    // An expansion shows its number with every part still blank.
    const digits = [...String(board.number)].map(Number);
    shown.add(String(board.number));
    digits.forEach((digit, index) => {
      shown.add(String(digit));
      shown.add(String(digit * 10 ** (digits.length - 1 - index)));
    });
  }
  const derive = (digits: number[]) => {
    shown.add(digits.join(""));
    digits.forEach((digit, index) => {
      shown.add(String(digit));
      shown.add(String(digit * 10 ** (digits.length - 1 - index)));
    });
  };
  if (board.digits?.length) derive(board.digits);
  for (const source of [board.text, board.title]) {
    if (!source) continue;
    // The textbook writes thousands with a space ("7 062"); join those,
    // but never join two separate numbers in a row ("84   101   528").
    for (const match of source.replace(/(\d)\s(?=\d{3}(?!\d))/gu, "$1").matchAll(/\d+/gu)) {
      shown.add(match[0]);
      if (match[0].length > 1) derive([...match[0]].map(Number));
    }
  }
  return shown;
}

function checkBoardContinuity(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  let carried: Set<string> = new Set();
  let concept: string | undefined;
  let opaque = false;
  let anythingStaged = false;

  beats.forEach((beat, index) => {
    if (beat.conceptTag !== concept) {
      concept = beat.conceptTag;
      carried = new Set();
      opaque = false;
      anythingStaged = false;
    }
    if (beat.board?.kind === "clear") {
      carried = new Set();
      opaque = false;
      anythingStaged = false;
    } else if (beat.board?.kind === "reveal") {
      if (beat.board.value !== undefined) carried.add(beat.board.value);
    } else if (beat.board?.kind === "abacus_add") {
      // Beads landing make that rod's count and place value readable.
      for (const { rod, count } of beat.board.adds ?? [{ rod: beat.board.rod ?? 0, count: beat.board.count ?? 0 }]) {
        carried.add(String(count));
        carried.add(String(count * 10 ** (3 - rod)));
      }
      anythingStaged = true;
    } else if (beat.board && !OVERLAY_BOARDS.has(beat.board.kind)) {
      opaque = OPAQUE_BOARDS.has(beat.board.kind);
      carried = numbersOnBoard(beat.board);
      anythingStaged = opaque || carried.size > 0 || beat.board.kind === "title";
    }

    // Single digits are counts and multipliers ("පබළු හතරක්", "එකකින්
    // දහයක්") — spoken constantly and not claims about the board. Only a
    // multi-digit number is a number the child is meant to be looking at.
    if (!opaque) {
      for (const value of beat.numbers ?? []) {
        if (value < 10 || carried.has(String(value))) continue;
        // Powers of ten are the UNITS of place value, not objects on the
        // board: "එක් පබළුවකින් දහසක් පෙන්වනවා" is the lesson, and
        // demanding "1000" be written up would flag it for teaching.
        if (POWERS_OF_TEN.has(value)) continue;
        // Announcing a number before building it is how a demonstration
        // starts ("ඔන්න අපි පන්දහස් හාරසිය විසි එක රාමුවට දාමු" over an
        // empty abacus). If the board acquires it shortly, it was a
        // promise, not a dangling reference.
        if (arrivesSoon(beats, index, value)) continue;
        findings.push({
          rule: "numberMustBeOnTheBoard",
          beatId: beat.id,
          detail: `says ${value} with the board showing ${carried.size ? [...carried].slice(0, 8).join(", ") : "nothing"}`,
          suggestion: "put it on the board in this beat, or point at what is already there",
        });
      }
    }
    const deictic = DEICTIC_PHRASES.find((phrase) => beat.spokenText.includes(phrase));
    if (deictic && !anythingStaged) {
      findings.push({
        rule: "numberMustBeOnTheBoard",
        beatId: beat.id,
        detail: `says "${deictic}" with nothing staged`,
        suggestion: "stage the thing being pointed at",
      });
    }
  });
  return findings;
}

/** The place-value units, spoken as units rather than shown as numbers. */
const POWERS_OF_TEN = new Set([10, 100, 1000, 10_000, 100_000]);
/** How many beats a number may take to arrive on the board after being announced. */
const ANNOUNCE_LOOKAHEAD = 3;

function arrivesSoon(beats: SpeechBeat[], index: number, value: number): boolean {
  for (let i = index + 1; i <= index + ANNOUNCE_LOOKAHEAD && i < beats.length; i += 1) {
    const board = beats[i]!.board;
    if (board && board.kind !== "none" && numbersOnBoard(board).has(String(value))) return true;
  }
  return false;
}

// --- 7. a planted mistake is always resolved ------------------------------

/**
 * A CHECK_MY_WORK asks the child to find Zara's deliberate error. Moving
 * on without ever saying what it was leaves the child who did NOT spot it
 * — the one the beat exists for — holding the wrong answer.
 */
function checkResolved(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  beats.forEach((beat, index) => {
    if (beat.type !== "CHECK_MY_WORK") return;
    for (let i = index + 1; i < beats.length; i += 1) {
      const next = beats[i]!;
      if (next.type === "RESOLVE") return;
      if (next.type === "TRANSITION" || next.conceptTag !== beat.conceptTag) break;
    }
    findings.push({
      rule: "checkMyWorkMustResolve",
      beatId: beat.id,
      detail: "the planted mistake is never named before the lesson moves on",
      suggestion: "add a RESOLVE beat that says what the error was and why",
    });
  });
  return findings;
}

// --- 8. an announced activity actually happens ----------------------------

/**
 * "Let's go to the board and make five numbers" followed by a transition
 * into the next concept. The child is promised work and then moved along;
 * the promise is what makes it feel like a lesson rather than a video.
 */
/** How far an announced activity may legitimately be staged before it happens. */
const ACTIVITY_LOOKAHEAD = 6;

const ACTIVITY_PHRASES = ["ලෑල්ලට යමු", "අභ්‍යාස", "හදමු", "පුරවමු"];

function checkAnnouncedActivities(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  beats.forEach((beat, index) => {
    const phrase = ACTIVITY_PHRASES.find((candidate) => beat.spokenText.includes(candidate));
    if (!phrase) return;
    // The window is generous on purpose. A demonstration legitimately
    // takes a few beats to set up — "let's use the cards" is followed by
    // getting the cards out and laying them down before the child is asked
    // anything — and a two-beat rule flags that correct staging. What the
    // rule is actually for is a promise the lesson never keeps: it must be
    // kept before the concept moves on, and within a handful of beats.
    const window: SpeechBeat[] = [];
    for (let i = index + 1; i < beats.length && window.length < ACTIVITY_LOOKAHEAD; i += 1) {
      if (beats[i]!.conceptTag !== beat.conceptTag) break;
      window.push(beats[i]!);
    }
    const interactive = window.some(
      (next) => next.type === "ASK" || next.type === "SOFT_CHECK" || next.type === "CHECK_MY_WORK",
    );
    if (interactive) return;
    findings.push({
      rule: "announcedActivityMustHappen",
      beatId: beat.id,
      detail:
        `announces work ("${phrase}") but nothing interactive follows before the concept ends ` +
        `(next: ${window.map((b) => b.type ?? "?").join(", ") || "nothing"})`,
      suggestion: "follow it with the interactive beats it promises",
    });
  });
  return findings;
}

// --- 9. a clear is a flash unless it changes something ---------------------

/**
 * The board keeps what it has unless a beat replaces it; "clear" is the
 * one way to blank it on purpose. Clearing between two beats that show
 * the SAME thing is a flash: the content vanishes and comes straight back.
 */
function effectiveBoardKey(board: SpeechBeat["board"]): string {
  return JSON.stringify(board ?? { kind: "none" });
}

function checkClears(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  beats.forEach((beat, index) => {
    if (beat.board?.kind !== "clear") return;
    let before: SpeechBeat["board"] | undefined;
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = beats[i]!.board;
      if (candidate && !OVERLAY_BOARDS.has(candidate.kind) && candidate.kind !== "clear") {
        before = candidate;
        break;
      }
    }
    let after: SpeechBeat["board"] | undefined;
    for (let i = index + 1; i < beats.length; i += 1) {
      const candidate = beats[i]!.board;
      if (candidate && !OVERLAY_BOARDS.has(candidate.kind) && candidate.kind !== "clear") {
        after = candidate;
        break;
      }
    }
    if (before && after && effectiveBoardKey(before) === effectiveBoardKey(after)) {
      findings.push({
        rule: "clearIsAFlash",
        beatId: beat.id,
        detail: `clears the board between two beats that both show ${before.kind} — it vanishes and comes straight back`,
        suggestion: "drop the clear; the board inherits",
      });
    }
  });
  return findings;
}

// --- 10. no clear inside a question run -----------------------------------

/**
 * A run of questions on an exercise, a blank or the digit picker is one
 * piece of work. Blanking the board anywhere inside it — between a
 * question and its confirmation, or between one question and the next —
 * takes away the thing the child is working on.
 */
const WORK_BOARDS = new Set(["blank", "exercise", "digitPicker"]);
const RUN_MEMBERS = new Set(["ASK", "SOFT_CHECK", "CHECK_MY_WORK", "EXPLAIN", "RESOLVE"]);

function checkClearsInRuns(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  let boardKind = "none";
  let inRun = false;
  let concept: string | undefined;
  beats.forEach((beat) => {
    if (beat.conceptTag !== concept) {
      concept = beat.conceptTag;
      inRun = false;
      boardKind = "none";
    }
    const kind = beat.board?.kind ?? "none";
    if (kind === "clear") {
      if (inRun) {
        findings.push({
          rule: "noClearInsideAnAskRun",
          beatId: beat.id,
          detail: "clears the board in the middle of a run of questions on it",
          suggestion: "keep the board up until the run's last confirmation",
        });
      }
      boardKind = "none";
      inRun = false;
      return;
    }
    if (!OVERLAY_BOARDS.has(kind)) {
      // A new board of a different kind ends the run; the same kind
      // re-staged (the picker again) continues it.
      if (inRun && !WORK_BOARDS.has(kind)) inRun = false;
      boardKind = kind;
    }
    if (beat.type === "ASK" && WORK_BOARDS.has(boardKind)) inRun = true;
    else if (inRun && !RUN_MEMBERS.has(beat.type ?? "")) inRun = false;
  });
  return findings;
}

// --- 11. the answer is not on the board before the question ---------------

/**
 * "5 421 = 5 000 + 400 + 20 + 1" on the board, then "what value does the
 * 5 give?" A question whose numeric answer is already WRITTEN on the
 * board is not a question. Literal tokens only: a digit visible inside a
 * larger number is exactly what a read-the-digit question asks for.
 */
function literalNumbersOnBoard(board: SpeechBeat["board"]): Set<string> {
  const literal = new Set<string>();
  if (!board) return literal;
  for (const source of [board.text, board.title]) {
    if (!source) continue;
    for (const match of source.replace(/(\d)\s(?=\d{3}(?!\d))/gu, "$1").matchAll(/\d+/gu)) literal.add(match[0]);
  }
  if (board.number !== undefined) literal.add(String(board.number));
  return literal;
}

function checkAnswersShownEarly(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  let literal = new Set<string>();
  let concept: string | undefined;
  beats.forEach((beat) => {
    if (beat.conceptTag !== concept) {
      concept = beat.conceptTag;
      literal = new Set();
    }
    const kind = beat.board?.kind ?? "none";
    if (kind === "clear") literal = new Set();
    else if (kind === "reveal" && beat.board?.value !== undefined) literal.add(beat.board.value);
    else if (!OVERLAY_BOARDS.has(kind)) literal = literalNumbersOnBoard(beat.board);

    if (beat.type !== "ASK" && beat.type !== "CHECK_MY_WORK") return;
    const expected = (beat.expectedAnswer ?? "").replace(/[\s,]/gu, "");
    if (!/^\d+$/u.test(expected) || !literal.has(expected)) return;
    findings.push({
      rule: "answerShownBeforeAsked",
      beatId: beat.id,
      detail: `asks for ${expected}, which is already written on the board`,
      suggestion: "stage the worked answer AFTER the question — reveal its parts as the confirmations arrive",
    });
  });
  return findings;
}

// --- 12. a board never displays an answer still to be asked for ----------

/**
 * The forward-looking half of answerShownBeforeAsked.
 *
 * That rule stands at each ASK and looks at the board; this one stands at
 * each BOARD and looks ahead at the questions still coming in the same
 * run. The pairs it catches are the same, but it is the check a board
 * intent can fail on its own — which is the form the review asked for,
 * after `parts: [5000, 400, 20, 1]` in the doc was read as the finished
 * sum being displayed.
 *
 * DISPLAYED, not stored: an expansion's `answers` are the key a later
 * `reveal` writes in and are deliberately excluded here, because the
 * renderer blanks every cell (boardFor maps them to null). The digits of
 * an abacus are excluded too — reading them off is the skill being
 * taught, not an answer given away.
 */
function displayedValues(board: SpeechBeat["board"]): Set<string> {
  const shown = new Set<string>();
  if (!board) return shown;
  if (board.kind === "reveal" && board.value !== undefined) shown.add(board.value.replace(/[\s,]/gu, ""));
  if (board.number !== undefined) shown.add(String(board.number));
  for (const source of [board.text, board.title]) {
    if (!source) continue;
    for (const match of source.replace(/(\d)\s(?=\d{3}(?!\d))/gu, "$1").matchAll(/\d+/gu)) shown.add(match[0]);
  }
  return shown;
}

function checkBoardShowsLaterAnswers(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  beats.forEach((beat, index) => {
    const shown = displayedValues(beat.board);
    if (shown.size === 0) return;
    // The run: forward until the concept changes or a new BASE board
    // replaces this one (an overlay keeps it up).
    for (let i = index + 1; i < beats.length; i += 1) {
      const next = beats[i]!;
      if (next.conceptTag !== beat.conceptTag) break;
      const kind = next.board?.kind ?? "none";
      if (!OVERLAY_BOARDS.has(kind) && kind !== "clear" && i !== index) break;
      if (kind === "clear") break;
      if (next.type !== "ASK" && next.type !== "CHECK_MY_WORK") continue;
      const expected = (next.expectedAnswer ?? "").replace(/[\s,]/gu, "");
      if (!/^\d+$/u.test(expected) || !shown.has(expected)) continue;
      findings.push({
        rule: "boardDisplaysALaterAnswer",
        beatId: beat.id,
        detail: `displays ${expected}, which ${next.id} goes on to ask for`,
        suggestion: "blank it until the question is answered, then reveal it",
      });
    }
  });
  return findings;
}

// --- the gate -------------------------------------------------------------

/** Every hit across all three rules, in beat order. */
export function checkSpeechRules(beats: SpeechBeat[]): SpeechFinding[] {
  const findings: SpeechFinding[] = [];
  for (const beat of beats) {
    const rhetorical = checkRhetorical(beat);
    if (rhetorical) findings.push(rhetorical);
    findings.push(...checkBanned(beat));
  }
  findings.push(...checkTermConsistency(beats));
  findings.push(...checkVerdicts(beats));
  findings.push(...checkAssumedAnswers(beats));
  findings.push(...checkBoardContinuity(beats));
  findings.push(...checkResolved(beats));
  findings.push(...checkAnnouncedActivities(beats));
  findings.push(...checkClears(beats));
  findings.push(...checkClearsInRuns(beats));
  findings.push(...checkAnswersShownEarly(beats));
  findings.push(...checkBoardShowsLaterAnswers(beats));
  const order = new Map(beats.map((beat, index) => [beat.id, index]));
  return findings.sort((a, b) => (order.get(a.beatId) ?? 0) - (order.get(b.beatId) ?? 0));
}

/** One line per finding, for a dry run or a failed assertion. */
export function formatSpeechFindings(findings: SpeechFinding[]): string {
  return findings
    .map((f) => `  ${f.rule}  ${f.beatId}: ${f.detail}${f.suggestion ? ` → ${f.suggestion}` : ""}`)
    .join("\n");
}
