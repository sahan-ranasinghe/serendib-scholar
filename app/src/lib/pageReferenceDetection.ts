/**
 * Detects an explicit spoken page reference ("page 43", "පිටුව 43", "43 වෙනි
 * පිටුව") in the model's output transcript, for the board/narration
 * consistency check in useGeminiLive.ts — both the visibility warning and
 * the deterministic auto-staging fallback rely on this same extraction, so
 * they can never disagree with each other about what was "said."
 *
 * Deliberately keyword-anchored (requires "page"/"පිටුව" right next to the
 * number) rather than matching any bare number in the transcript — a
 * confirmed real narration includes numbers with nothing to do with page
 * navigation (e.g. "31 × 8" while working a multiplication problem), and a
 * bare-number match would misfire on those constantly.
 */

// Numbers are expected as plain digits even inside an otherwise-Sinhala
// sentence (see prompt.ts's LANGUAGE section: numbers are naturally
// code-switched to English/digits, not spelled out), so no digit-word
// parsing is needed for either language.
const PAGE_KEYWORD_THEN_NUMBER = /(?:page|පිටුව)\s*(?:number|අංකය|අංක)?\s*(\d{1,3})/giu;
// Sinhala commonly puts the number before the noun with an ordinal suffix,
// e.g. "43 වෙනි පිටුව" ("the 43rd page").
const NUMBER_THEN_PAGE_KEYWORD = /(\d{1,3})\s*(?:වෙනි|වැනි)?\s*(?:page|පිටුව)/giu;

/**
 * Returns every distinct page number explicitly referenced in `text`, in
 * first-mentioned order. Empty if no keyword-anchored mention is found.
 */
export function extractMentionedPageNumbers(text: string): number[] {
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const pattern of [PAGE_KEYWORD_THEN_NUMBER, NUMBER_THEN_PAGE_KEYWORD]) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (!seen.has(value)) {
        seen.add(value);
        ordered.push(value);
      }
    }
  }
  return ordered;
}
