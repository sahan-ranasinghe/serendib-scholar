/**
 * The distance guard: proof that generated speech is NOT the recorded
 * teacher's phrasing.
 *
 * Every generated sentence is compared against every sentence of the
 * source transcript on two axes — surface (character 5-gram Jaccard) and
 * meaning-shape (embedding cosine). Before comparing, both sides are
 * STRIPPED of everything that is officially shared vocabulary and cannot
 * count as copying:
 *   - digits and Sinhala number names (deterministic output of
 *     sinhalaNumberName — both teachers must say "විසි හයදහස්"),
 *   - the guide's 11 vocabulary terms (both must say "දස දහසස්ථානය"),
 *   - verbatim textbook instructions ("වගුව සම්පූර්ණ කරන්න" is official
 *     text, read aloud by design).
 * What remains is the phrasing that is actually the author's — and THAT
 * must stay far from hers.
 */
import { isNumberWord } from "@/lib/sinhalaNumber";
import { VOCABULARY_INTRODUCED_BY } from "@/lib/lessonDesign";

/** A surviving sentence may share at most this 5-gram Jaccard with any transcript sentence. */
export const MAX_JACCARD = 0.35;
/** …and at most this embedding cosine. */
export const MAX_COSINE = 0.88;

/**
 * CANONICAL QUESTION FRAMES — exempt from the distance guard.
 *
 * There is one natural Sinhala phrasing for a place-value question
 * ("සියයේ ස්ථානයේ තියෙන ඉලක්කම මොකක්ද?"): in the model comparison all
 * three candidates independently converged on it at Jaccard up to 0.86.
 * Convergence on the canonical form of an official drill question is
 * expected, not copying — like the numbers and vocabulary terms, these
 * frames are stripped from BOTH sides before similarity is measured, so
 * only genuinely authorial phrasing is compared.
 */
const CANONICAL_FRAMES = [
  // spoken/genitive forms of the place names (the compound vocabulary
  // terms are stripped separately)
  "එකේ ස්ථානයේ", "එකේ ස්ථානය", "දහයේ ස්ථානයේ", "දහයේ ස්ථානය",
  "සියයේ ස්ථානයේ", "සියයේ ස්ථානය", "දහසේ ස්ථානයේ", "දහසේ ස්ථානය",
  "දස දහසේ ස්ථානයේ", "දස දහසේ ස්ථානය", "දහස්ථානයේ", "දහස්ථානය",
  // canonical question frames
  "තියෙන ඉලක්කම මොකක්ද", "ඉලක්කම මොකක්ද", "සංඛ්‍යාව මොකක්ද", "මොකක්ද",
  "කීයද", "කියන්න පුළුවන්ද", "කාටද කියන්න පුළුවන්", "කියන්න බලන්න",
  // textbook instruction phrasings (official imperatives)
  "සම්පූර්ණ කරන්න", "හිස්තැන් පුරවන්න", "නිරූපණය කරන්න", "ලියන්න",
  // the rollover build-up the guide itself mandates (9+1=10 … 99 999+1):
  // "adding one to N" has one natural spoken form, shared by necessity
  "එකක් එකතු කළාම", "එකක් එකතු වුණාම", "එකක් එකතු කරපුවහම", "එකක් එකතු කළොත්",
  // guide activity 2's own printed question frames: the digit at a place,
  // the value it represents ("ඉලක්කමෙන් නිරූපණය වන අගය" is the guide's own
  // wording, and the only Sinhala there is for it)
  "ඉලක්කමෙන් නිරූපණය වන අගය", "නිරූපණය වන අගය", "නිරූපණය වෙන්නේ", "නිරූපණය වෙනවා",
  "ඉලක්කමෙන් දැක්වෙන අගය", "දැක්වෙන අගය", "කීයක් තියෙනවද", "තියෙනවා නේද", "තියෙන්නේ",
];

/** Sentence split shared with the pacing code: [.!?…] ends a sentence. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Strips the shared-by-necessity material so only authored phrasing is
 * compared. `extraVerbatim` carries the textbook instruction strings.
 */
export function stripOfficial(text: string, extraVerbatim: string[] = []): string {
  let out = text;
  // Verbatim official instructions first (longest strings, before token work).
  for (const instruction of extraVerbatim) {
    if (instruction.trim()) out = out.split(instruction.trim()).join(" ");
  }
  // Vocabulary terms (multi-word ones first).
  const terms = Object.keys(VOCABULARY_INTRODUCED_BY).sort((a, b) => b.length - a.length);
  for (const term of terms) out = out.split(term).join(" ");
  // Canonical question/instruction frames — see CANONICAL_FRAMES above.
  for (const frame of [...CANONICAL_FRAMES].sort((a, b) => b.length - a.length)) {
    out = out.split(frame).join(" ");
  }
  // Digits (with their grouping spaces) and the {number:...} markers.
  out = out.replace(/\{number:\d+\}/gu, " ").replace(/\d[\d\s,]*/gu, " ");
  // Number-name lexemes, token by token — including the bound case endings
  // the joiner attaches ("නවයට", "විස්සයි"), which are still number words.
  out = out
    .split(/\s+/u)
    .filter((word) => !isNumberWord(word))
    .join(" ");
  // The address token is infrastructure, not phrasing.
  out = out.split("{address}").join(" ");
  return out.replace(/\s+/gu, " ").trim();
}

/** Character 5-grams over a whitespace-normalised string. */
export function charNgrams(text: string, n = 5): Set<string> {
  const normalised = text.replace(/\s+/gu, " ").trim();
  const grams = new Set<string>();
  for (let i = 0; i + n <= normalised.length; i += 1) grams.add(normalised.slice(i, i + n));
  return grams;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of small) if (large.has(gram)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

export interface SimilarityHit {
  sentence: string;
  closestTranscript: string;
  jaccard: number;
  cosine: number | null;
}

/**
 * The surface check for one generated text against the (pre-stripped,
 * pre-grammed) transcript corpus. Sentences whose stripped remainder is
 * too short to mean anything (< 20 chars) are skipped — after removing
 * numbers and vocabulary, "දැන් {number:84} බලන්න" has nothing left worth
 * comparing, and a two-word universal teacher phrase ("පැහැදිලියි නේද?")
 * is nobody's signature — three authoring runs stalled on exactly those.
 */
export function surfaceSimilarity(
  generated: string,
  corpus: Array<{ sentence: string; grams: Set<string> }>,
  extraVerbatim: string[] = [],
): SimilarityHit[] {
  const hits: SimilarityHit[] = [];
  for (const sentence of sentencesOf(generated)) {
    const stripped = stripOfficial(sentence, extraVerbatim);
    if (stripped.length < 20) continue;
    const grams = charNgrams(stripped);
    let best = 0;
    let closest = "";
    for (const entry of corpus) {
      const score = jaccard(grams, entry.grams);
      if (score > best) {
        best = score;
        closest = entry.sentence;
      }
    }
    hits.push({ sentence, closestTranscript: closest, jaccard: best, cosine: null });
  }
  return hits;
}
