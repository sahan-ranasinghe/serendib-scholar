/**
 * The {address} token: how spoken text addresses the child.
 *
 * Authored lines (src/lib/authoredLines.ts) and cleaned transcripts
 * (scripts/clean-transcripts.ts) never hard-code පුතේ/දුවේ — they carry the
 * literal token {address}, resolved per child at next_beat() time:
 *
 *   boy         → පුතේ
 *   girl        → දුවේ
 *   unspecified → the word is dropped and the sentence tidied so it still
 *                 reads naturally ("දැන් බලන්න {address}," → "දැන් බලන්න,").
 *
 * The token is used ONLY as a standalone vocative (the transcript cleanup
 * rewrites possessives to ඔයාගේ), so dropping it is always safe.
 */
import type { Beat } from "@/lib/lessonOrchestrator";

export type ChildGender = "boy" | "girl" | "unspecified";

export const ADDRESS_TOKEN = "{address}";

const ADDRESS_WORD: Record<Exclude<ChildGender, "unspecified">, string> = {
  boy: "පුතේ",
  girl: "දුවේ",
};

export function resolveAddress(text: string, gender: ChildGender): string {
  if (!text.includes(ADDRESS_TOKEN)) return text;
  if (gender !== "unspecified") {
    return text.split(ADDRESS_TOKEN).join(ADDRESS_WORD[gender]);
  }
  // Drop the token together with the space before it, then tidy the
  // punctuation the missing word leaves behind.
  return text
    .replace(/\s*\{address\}/gu, "")
    .replace(/([,.!?])\1+/gu, "$1") // ",," from "…{address}, ," patterns
    .replace(/\s+([,.!?])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .replace(/^[\s,]+/u, "")
    .trim();
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
