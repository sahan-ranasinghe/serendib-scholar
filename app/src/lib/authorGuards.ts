/**
 * The author's hard guarantees, as pure functions — shared by the real
 * author (scripts/author-script.ts) and the model comparison
 * (scripts/compare-authors.ts), so every candidate model is judged by
 * exactly the rules production enforces.
 */
import { renderNumberMarkers } from "@/lib/sinhalaNumber";
import { sentencesOf } from "@/lib/scriptDistance";
import { DESIGN_CONCEPTS, VOCABULARY_INTRODUCED_BY, type DesignConceptTag } from "@/lib/lessonDesign";

// --- number markers -------------------------------------------------------

/**
 * {number:26147} → විසි හයදහස් එකසිය හතළිස් හත; returns the numbers used.
 *
 * Delegates to renderNumberMarkers so the author binds case endings the
 * same way the authored script does — the "නවය ට එක ක්" spacing bug got
 * into session 1 because this step spliced names in and left the spacing
 * exactly as the model wrote it.
 */
export function substituteNumbers(text: string): { spoken: string; numbers: number[] } {
  return renderNumberMarkers(text);
}

export interface Problem {
  rule: string;
  detail: string;
}

export function conceptIndex(tag: DesignConceptTag): number {
  return DESIGN_CONCEPTS.indexOf(tag);
}

export function validateSay(
  say: string,
  conceptTag: DesignConceptTag,
  denylist: Set<number>,
): Problem[] {
  const problems: Problem[] = [];
  const markerNumbers = [...say.matchAll(/\{number:(\d+)\}/gu)].map((match) => Number(match[1]));
  for (const value of markerNumbers) {
    if (denylist.has(value)) {
      problems.push({ rule: "denylist", detail: `{number:${value}} is the recorded teacher's own invention — use an official or NEW number instead.` });
    }
    if (value > 100_000) problems.push({ rule: "range", detail: `{number:${value}} is beyond this lesson (max 100000).` });
  }
  const withoutMarkers = say.replace(/\{number:\d+\}/gu, "N");
  if (/\d/u.test(withoutMarkers)) {
    problems.push({ rule: "digits", detail: "Digits may only appear inside {number:...} markers — never write a numeral or a number name yourself." });
  }
  // Sentence length: ≤14 words, a marker counting as one.
  for (const sentence of sentencesOf(withoutMarkers)) {
    const words = sentence.split(/\s+/u).filter(Boolean).length;
    if (words > 14) {
      problems.push({ rule: "sentence-length", detail: `Too long (${words} words): "${sentence.slice(0, 70)}" — split it.` });
    }
  }
  // Vocabulary timing: no term introduced by a LATER concept.
  const myIndex = conceptIndex(conceptTag);
  for (const [term, introducedBy] of Object.entries(VOCABULARY_INTRODUCED_BY)) {
    if (conceptIndex(introducedBy) > myIndex && say.includes(term)) {
      problems.push({
        rule: "vocabulary",
        detail: `"${term}" is introduced later (${introducedBy}) — it must not appear in ${conceptTag}.`,
      });
    }
  }
  if (/[A-Za-z]{2,}/u.test(say.replace(/\{number:\d+\}|\{address\}/gu, ""))) {
    problems.push({ rule: "language", detail: "No English words in speech." });
  }
  return problems;
}


// --- degenerate output guard ----------------------------------------------
//
// A comparison run produced an `analogy` field holding ~230 words of
// English scaffolding babble ("payload construct execute finish…") that
// passed every content check, because only spokenText was validated. Every
// generated field now goes through this: model-shaped garbage is rejected
// and regenerated, never stored.

/** Roughly how long each field SHOULD be; 3× this is the rejection line. */
export const FIELD_EXPECTED_LENGTH: Record<string, number> = {
  say: 420,
  analogyDomain: 40,
  expectedAnswer: 30,
  errorPlanted: 140,
  guideStep: 180,
  hookCandidate: 260,
  boardText: 320,
  boardTitle: 60,
};

const SINHALA_CHAR = /[\u0D80-\u0DFF]/u;
const LATIN_WORD = /^[A-Za-z]{2,}$/u;

/**
 * Field-level sanity: reject when a field
 *  - contains more than 3 CONSECUTIVE Latin-script words,
 *  - exceeds 3× its expected length,
 *  - repeats any token more than 5 times, or
 *  - (speech fields) is less than 60% Sinhala by letter count.
 */
export function degenerateProblems(
  field: string,
  value: string,
  options: { expectSinhala?: boolean; englishOk?: boolean } = {},
): Problem[] {
  const problems: Problem[] = [];
  const trimmed = value.trim();
  if (!trimmed) return problems;

  const expected = FIELD_EXPECTED_LENGTH[field] ?? 200;
  if (trimmed.length > expected * 3) {
    problems.push({
      rule: "degenerate-length",
      detail: `${field} is ${trimmed.length} chars — over 3× its expected ~${expected}. Give a short, real value.`,
    });
  }

  // Runs of Latin words ({number:...} markers and {address} are not words).
  // \p{M} kept: Sinhala viramas/vowel signs are combining marks, and
  // splitting on them shreds words into repeating shards ("දහස්" → "දහස",
  // "න" …) — a real run rejected clean Sinhala for "repeating න 6 times".
  const tokens = trimmed.replace(/\{number:\d+\}|\{address\}/gu, " ").split(/[^\p{L}\p{M}\p{N}']+/u).filter(Boolean);
  let run = 0;
  let worstRun = 0;
  for (const token of tokens) {
    run = LATIN_WORD.test(token) ? run + 1 : 0;
    if (run > worstRun) worstRun = run;
  }
  if (worstRun > 3 && !options.englishOk) {
    problems.push({
      rule: "degenerate-english",
      detail: `${field} contains ${worstRun} consecutive English words — no English scaffolding in any field.`,
    });
  }

  const counts = new Map<string, number>();
  // Function words repeat in any honest sentence ("the" six times in one
  // English guide citation is prose, not looping) — only content-sized
  // tokens count toward the repetition rule.
  //
  // "Content-sized" is 3 characters, not 4: Sinhala content words are
  // short, and at the old threshold a real loop of හරි ("හරි හරි හරි…")
  // was invisible to this rule because හරි is exactly 3 characters long.
  for (const token of tokens) {
    if (token.length <= 2) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const repeated = [...counts.entries()].filter(([, count]) => count > 5);
  if (repeated.length > 0) {
    problems.push({
      rule: "degenerate-repetition",
      detail: `${field} repeats "${repeated[0][0]}" ${repeated[0][1]} times — that is looping, not writing.`,
    });
  }

  if (options.expectSinhala) {
    const letters = [...trimmed.replace(/\{number:\d+\}|\{address\}/gu, "")].filter((ch) => /\p{L}/u.test(ch));
    const sinhala = letters.filter((ch) => SINHALA_CHAR.test(ch)).length;
    if (letters.length > 0 && sinhala / letters.length < 0.6) {
      problems.push({
        rule: "degenerate-language",
        detail: `${field} is only ${Math.round((sinhala / letters.length) * 100)}% Sinhala — it must be spoken Sinhala.`,
      });
    }
  }
  return problems;
}

/** Every field of one generated beat, checked. Speech-like fields expect Sinhala. */
export function degenerateBeatProblems(fields: Record<string, string | undefined>): Problem[] {
  const speechFields = new Set(["say", "hookCandidate"]);
  // guideStep cites the teacher's guide, whose steps are English — length
  // and repetition still apply, the Latin-run rule does not.
  const englishOkFields = new Set(["guideStep"]);
  const problems: Problem[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== "string") continue;
    problems.push(
      ...degenerateProblems(field, value, {
        expectSinhala: speechFields.has(field),
        englishOk: englishOkFields.has(field),
      }),
    );
  }
  return problems;
}
