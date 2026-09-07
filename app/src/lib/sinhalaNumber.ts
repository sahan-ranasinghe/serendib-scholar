/**
 * Sinhala number names, 0–100 000 — DETERMINISTIC.
 *
 * Any number Zara says aloud comes from this function, never from a model:
 * a language model asked to write "26 147" in Sinhala will sometimes drop a
 * zero or slip a place, and a maths tutor that misreads numbers is worse
 * than no tutor. The generator writes {number:26147} markers; the script
 * pipeline substitutes this function's words (see scripts/author-script.ts).
 *
 * The grammar below is derived from the VERIFIED pairs in the official
 * sources — the textbook transcription (lesson1-numbers.ts) and the
 * teacher's guide (docs/design/maths-5-1-teacher-guide.md):
 *
 *   2 430  දෙදහස් හාරසිය තිහ          10 000  දස දහස
 *   3 100  තුන්දහස් එකසියය            13 220  දහ තුන්දහස් දෙසිය විස්ස
 *   1 008  එක්දහස් අට                26 147  විසි හයදහස් එකසිය හතළිස් හත
 *   2 311  දෙදහස් තුන්සිය එකොළහ       72 932  හැත්තෑ දෙදහස් නවසිය තිස් දෙක
 *  50 005  පනස් දහස් පහ             100 000  සියක් දහස
 *
 * Two conventions those pairs pin down:
 *  - COMBINING vs TERMINAL forms: every non-final component uses its
 *    combining form (පන්දහස්, තුන්සිය, විසි), the final one its terminal
 *    form (පන්දහස, තුන්සියය, විස්ස).
 *  - ZERO places are simply OMITTED: 5 060 → පන්දහස් හැට; 1 008 → එක්දහස් අට.
 *
 * One derived rule (single attestation, 13 220): a teens count of
 * thousands decomposes as දහ + unit — "දහ තුන්දහස්" — so 11 000 renders
 * දහ එක්දහස්, 19 000 renders දහ නවදහස්.
 */

const UNITS_TERMINAL = ["", "එක", "දෙක", "තුන", "හතර", "පහ", "හය", "හත", "අට", "නවය"];
const TEENS_TERMINAL = ["දහය", "එකොළහ", "දොළහ", "දහතුන", "දාහතර", "පහළොව", "දහසය", "දාහත", "දහඅට", "දහනවය"];
const TENS_TERMINAL = ["", "දහය", "විස්ස", "තිහ", "හතළිහ", "පනහ", "හැට", "හැත්තෑව", "අසූව", "අනූව"];
const TENS_COMBINING = ["", "", "විසි", "තිස්", "හතළිස්", "පනස්", "හැට", "හැත්තෑ", "අසූ", "අනූ"];
/** Prefixes that attach to දහස: එක්දහස්, දෙදහස්, තුන්දහස් … (1 008 → එක්දහස් අට). */
const THOUSAND_PREFIX = ["", "එක්", "දෙ", "තුන්", "හාර", "පන්", "හය", "හත්", "අට", "නව"];
/** Prefixes that attach to සිය: note එක, not එක් — 112 → එකසිය දොළහ (textbook). */
const HUNDRED_PREFIX = ["", "එක", "දෙ", "තුන්", "හාර", "පන්", "හය", "හත්", "අට", "නව"];

export const SINHALA_ZERO = "බිංදුව";

/**
 * Case endings that attach DIRECTLY to a number name — no space.
 *
 * The generator writes them as a suffix on the marker ("{number:9}ට"), but
 * a model will just as often put a space in ("{number:9} ට"), and the old
 * substitution kept whatever it was given: the session-1 script shipped
 * "නවය ට එක ක්" where a child must hear "නවයට එකක්". Sinhala writes these
 * bound — a space turns one word into two and the clip reads as a stutter.
 *
 * Longest first: the alternation is first-match, so ක්ම must be tried
 * before ක්, and ක් before ක, or the longer ending is split.
 */
const PLAIN_JOINERS = ["කුත්", "කින්", "ක්ම", "ටම", "ක්", "යි", "ට", "ක", "ම"] as const;

/**
 * Vowel-sign endings. These are not letters — they are signs that land on
 * the PRECEDING consonant, so they must be concatenated with nothing at
 * all between: දෙක + ේ → දෙකේ. A space orphans the sign onto a dotted
 * circle (දෙක ේ), which is how "දෙකක අගය" was reached by hand-patching.
 */
const VOWEL_SIGN_JOINERS = ["ෙන්", "ේ", "ෙ"] as const;

/**
 * The instrumental "by/with N". Written ෙන් — the sign on the final
 * consonant — but repeatedly emitted as a bare න්, giving පහන් for පහෙන්
 * and දෙකන් for දෙකෙන්. A bare න් after a number is never right, so it is
 * always repaired rather than flagged.
 */
const BARE_INSTRUMENTAL = "න්";

/** A Sinhala letter or sign; used to prove an ending is not a word's first syllable. */
const SINHALA = "\\u0D80-\\u0DFF";

/**
 * Marker + optional space + ending, where the ending is NOT followed by
 * more Sinhala. That last condition is what keeps "{number:1364} කියලයි"
 * intact: "ක" is a joiner, but "කියලයි" continues into ි, so it is a word
 * of its own and the space stays.
 */
const JOINER_PATTERN = new RegExp(
  `(\\{number:\\d+\\})\\s*(${[...VOWEL_SIGN_JOINERS, ...PLAIN_JOINERS, BARE_INSTRUMENTAL]
    .map((ending) => ending.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("|")})(?![${SINHALA}])`,
  "gu",
);

/**
 * Binds every case ending to the number marker it belongs to, so the
 * substitution downstream can be a plain splice. Operates on MARKER text
 * (before names are substituted) — that is the only point where a number
 * and its ending are still unambiguously identifiable.
 */
export function normalizeNumberJoiners(text: string): string {
  return text.replace(JOINER_PATTERN, (_match, marker: string, ending: string) =>
    `${marker}${ending === BARE_INSTRUMENTAL ? "ෙන්" : ending}`,
  );
}

/**
 * {number:N} markers → spoken Sinhala, endings bound. The one path from
 * authored source text to words a child hears; returns the numbers it
 * spoke so the portal can verify an actor said each of them.
 */
export function renderNumberMarkers(text: string): { spoken: string; numbers: number[] } {
  const numbers: number[] = [];
  const spoken = normalizeNumberJoiners(text).replace(/\{number:(\d+)\}/gu, (_match, digits: string) => {
    const value = Number(digits);
    numbers.push(value);
    return sinhalaNumberName(value);
  });
  return { spoken, numbers };
}

/**
 * The full Sinhala name of an integer 0..100000, in the textbook's
 * register. Throws outside that range — this lesson has no business past
 * සියක් දහස, and silently improvising would defeat the point.
 */
export function sinhalaNumberName(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 100_000) {
    throw new Error(`sinhalaNumberName: ${n} is outside 0..100000`);
  }
  if (n === 0) return SINHALA_ZERO;
  if (n === 100_000) return "සියක් දහස";
  // Exactly one hundred / one thousand drop the එක prefix (guide: 99+1 =
  // 100 සියය, 999+1 = 1000 දහස) — but WITHIN a larger number the prefix
  // appears (10 112 → … එකසිය දොළහ; 1 008 → එක්දහස් අට).
  if (n === 100) return "සියය";
  if (n === 1000) return "දහස";

  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor((n % 1000) / 100);
  const belowHundred = n % 100;

  const parts: Array<{ combining: string; terminal: string }> = [];
  if (thousands > 0) parts.push(thousandsPart(thousands));
  if (hundreds > 0) {
    parts.push({ combining: `${HUNDRED_PREFIX[hundreds]}සිය`, terminal: `${HUNDRED_PREFIX[hundreds]}සියය` });
  }
  if (belowHundred > 0) parts.push(belowHundredPart(belowHundred));

  return parts
    .map((part, index) => (index === parts.length - 1 ? part.terminal : part.combining))
    .join(" ");
}

/** 1..99 thousands: the count in its combining shape + දහස/දහස්. */
function thousandsPart(count: number): { combining: string; terminal: string } {
  if (count <= 9) {
    // 5 000 → පන්දහස / පන්දහස්
    return { combining: `${THOUSAND_PREFIX[count]}දහස්`, terminal: `${THOUSAND_PREFIX[count]}දහස` };
  }
  if (count === 10) {
    // 10 000 → දස දහස (guide) / දස දහස් එකසිය දොළහ (textbook)
    return { combining: "දස දහස්", terminal: "දස දහස" };
  }
  if (count < 20) {
    // 13 220 → දහ තුන්දහස් … (textbook); so 11..19 = දහ + unit + දහස්
    const unit = count - 10;
    return { combining: `දහ ${THOUSAND_PREFIX[unit]}දහස්`, terminal: `දහ ${THOUSAND_PREFIX[unit]}දහස` };
  }
  const tens = Math.floor(count / 10);
  const unit = count % 10;
  if (unit === 0) {
    // 50 000 → පනස් දහස (step 6) / පනස් දහස් පහ (step 8)
    return { combining: `${TENS_COMBINING[tens]} දහස්`, terminal: `${TENS_COMBINING[tens]} දහස` };
  }
  // 26 147 → විසි හයදහස් …; 72 932 → හැත්තෑ දෙදහස් …
  return {
    combining: `${TENS_COMBINING[tens]} ${THOUSAND_PREFIX[unit]}දහස්`,
    terminal: `${TENS_COMBINING[tens]} ${THOUSAND_PREFIX[unit]}දහස`,
  };
}

/** 1..99: units, teens, tens, or tens+units. */
function belowHundredPart(n: number): { combining: string; terminal: string } {
  if (n <= 9) return { combining: UNITS_TERMINAL[n], terminal: UNITS_TERMINAL[n] };
  if (n < 20) return { combining: TEENS_TERMINAL[n - 10], terminal: TEENS_TERMINAL[n - 10] };
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (unit === 0) return { combining: TENS_COMBINING[tens], terminal: TENS_TERMINAL[tens] };
  // 84 → අසූ හතර; 47 → හතළිස් හත
  const text = `${TENS_COMBINING[tens]} ${UNITS_TERMINAL[unit]}`;
  return { combining: text, terminal: text };
}

/** Every ending that can bind to a number name — see normalizeNumberJoiners. */
const BOUND_ENDINGS: readonly string[] = [...VOWEL_SIGN_JOINERS, ...PLAIN_JOINERS, "ෙන්"];

let lexemeCache: Set<string> | null = null;

/**
 * Is this token a number name, with or without a case ending?
 *
 * The distance guard strips number vocabulary before measuring similarity.
 * A bare-name lookup was enough while the substitution left endings
 * detached ("නවය ට" → the token "නවය"), but the joiner binds them now
 * ("නවයට"), and an unstripped number name reads to the guard as authorial
 * phrasing — inflating every line that says a number in the dative.
 * Endings are peeled (up to two, for stacked forms like එක + ම + යි)
 * before the lookup.
 */
export function isNumberWord(token: string): boolean {
  let bare = token.replace(/[.,!?…]+$/u, "");
  if (!bare) return false;
  lexemeCache ??= sinhalaNumberLexemes();
  for (let peeled = 0; peeled <= 2; peeled += 1) {
    if (lexemeCache.has(bare)) return true;
    const ending = BOUND_ENDINGS.find((suffix) => bare.length > suffix.length && bare.endsWith(suffix));
    if (!ending) return false;
    bare = bare.slice(0, -ending.length);
  }
  return false;
}

/**
 * Every word this function can ever emit — the distance guard strips these
 * before comparing generated speech to the source transcript, so official
 * number vocabulary never counts as "copied phrasing".
 */
export function sinhalaNumberLexemes(): Set<string> {
  const words = new Set<string>([SINHALA_ZERO, "සියක්", "දහස", "දහස්", "දස", "දහ", "සියය", "දහය"]);
  for (const list of [UNITS_TERMINAL, TEENS_TERMINAL, TENS_TERMINAL, TENS_COMBINING]) {
    for (const word of list) if (word) word.split(" ").forEach((w) => words.add(w));
  }
  for (let digit = 1; digit <= 9; digit += 1) {
    words.add(`${HUNDRED_PREFIX[digit]}සිය`);
    words.add(`${HUNDRED_PREFIX[digit]}සියය`);
    words.add(`${THOUSAND_PREFIX[digit]}දහස`);
    words.add(`${THOUSAND_PREFIX[digit]}දහස්`);
  }
  return words;
}
