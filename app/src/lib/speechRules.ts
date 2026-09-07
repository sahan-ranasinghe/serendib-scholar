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
}

export type SpeechRule =
  | "rhetoricalMustEndWithTag"
  | "bannedInSpeech"
  | "termConsistencyAfterIntroduction";

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
  const order = new Map(beats.map((beat, index) => [beat.id, index]));
  return findings.sort((a, b) => (order.get(a.beatId) ?? 0) - (order.get(b.beatId) ?? 0));
}

/** One line per finding, for a dry run or a failed assertion. */
export function formatSpeechFindings(findings: SpeechFinding[]): string {
  return findings
    .map((f) => `  ${f.rule}  ${f.beatId}: ${f.detail}${f.suggestion ? ` → ${f.suggestion}` : ""}`)
    .join("\n");
}
