/**
 * The {address} token: how spoken text addresses the child.
 *
 * Authored lines (src/lib/authoredLines.ts) and cleaned transcripts
 * (scripts/clean-transcripts.ts) never hard-code පුතේ/දුවේ — they carry the
 * literal token {address}, resolved per child at next_beat() time.
 *
 * It resolves to පුතේ for EVERY child. In everyday Sri Lankan Sinhala පුතේ
 * is what an adult calls a child of either sex; දුවේ is not the neutral
 * counterpart it looks like to a non-speaker, and dropping the vocative
 * altogether makes Zara sound colder than a teacher ever is (native-speaker
 * review, docs/review/session-1-edits.json §1).
 *
 * The token stays in the data rather than being baked into the words: the
 * lines are still addressed-at-a-child, so a per-name option ("නිමලී") can
 * be added later without re-authoring a script. What it buys today is one
 * recording per line — every child hears the same clip, so the audio cache
 * has no gender dimension at all.
 *
 * The token is used ONLY as a standalone vocative (the transcript cleanup
 * rewrites possessives to ඔයාගේ), so a single word always fits.
 */
import type { Beat } from "@/lib/lessonOrchestrator";

export type ChildGender = "boy" | "girl" | "unspecified";

export const ADDRESS_TOKEN = "{address}";

/** How Zara addresses the child — the same word whoever is listening. */
export const ADDRESS_WORD = "පුතේ";

// The gender argument is kept deliberately: every caller already threads a
// ChildGender through, and it is the seam a per-name vocative would use.
// Resolution simply does not depend on it any more.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveAddress(text: string, gender: ChildGender): string {
  if (!text.includes(ADDRESS_TOKEN)) return text;
  return text.split(ADDRESS_TOKEN).join(ADDRESS_WORD);
}

/** Resolves every speakable field of a beat for this child. Pure; returns a new beat. */
export function resolveBeatAddress<T extends Pick<Beat, "spokenText" | "sayCandidates" | "praiseText" | "goal">>(
  beat: T,
  gender: ChildGender,
): T {
  return {
    ...beat,
    spokenText: beat.spokenText ? resolveAddress(beat.spokenText, gender) : beat.spokenText,
    sayCandidates: beat.sayCandidates?.map((candidate) => resolveAddress(candidate, gender)),
    praiseText: beat.praiseText ? resolveAddress(beat.praiseText, gender) : beat.praiseText,
  };
}
