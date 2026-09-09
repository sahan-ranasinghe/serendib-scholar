/**
 * Judging a PHRASE answer — a CHECK_MY_WORK finding, a "why" question —
 * where one child says "අටට බිංදුවක් දාන්න ඕනේ" and another "ඒක අසූව
 * වෙන්න ඕනේ" and both are right.
 *
 * Two stages:
 *   1. deterministic — every accept token of the beat's rubric, after
 *      number-name normalisation (80 ↔ අසූව), looked for in the child's
 *      words. A match decides, no model in the loop.
 *   2. only if nothing matched — one Flash call with the rubric and the
 *      transcript → { accepted, why } (see /api/planner, `rubric`).
 *
 * The stage that decided is logged with the decision.
 */
import { sinhalaNumberName } from "@/lib/sinhalaNumber";
import type { PhraseRubric } from "@/lib/authoredScript";

export type { PhraseRubric };

/** Lower-case, no punctuation, no spaces — the shape both sides are compared in. */
export function squash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:—–\-"'()]/gu, " ")
    .replace(/\s+/gu, "");
}

/** Every form a token may take in speech: itself, its digits' names, its name's digits. */
export function forms(text: string): string[] {
  const out = new Set<string>([squash(text)]);
  // 80 → අසූව (and "80" spelt inside a phrase)
  const named = text.replace(/\d+/gu, (digits) => {
    const value = Number(digits);
    try {
      return value <= 100_000 ? sinhalaNumberName(value) : digits;
    } catch {
      return digits;
    }
  });
  out.add(squash(named));
  return [...out].filter(Boolean);
}

export interface LocalVerdict {
  accepted: boolean;
  /** The accept token that matched, if one did. */
  matched: string | null;
}

/** Stage 1: does any accept token (in any of its forms) appear in the transcript (in any of its forms)? */
export function judgePhraseLocally(transcript: string, rubric: PhraseRubric): LocalVerdict {
  const said = forms(transcript);
  if (said.every((s) => s.length === 0)) return { accepted: false, matched: null };
  for (const token of rubric.acceptIfAnyOf) {
    const tokenForms = forms(token);
    if (tokenForms.some((t) => t.length > 0 && said.some((s) => s.includes(t)))) return { accepted: true, matched: token };
  }
  return { accepted: false, matched: null };
}

export interface PhraseVerdict {
  accepted: boolean;
  why: string;
  stage: 1 | 2;
}

/** Stage 2's shape — the model call, injected so the judge is testable without one. */
export type RubricModel = (transcript: string, rubric: PhraseRubric) => Promise<{ accepted: boolean; why: string }>;

/** Both stages: local first; the model only when nothing matched. */
export async function judgePhrase(transcript: string, rubric: PhraseRubric, model: RubricModel): Promise<PhraseVerdict> {
  const local = judgePhraseLocally(transcript, rubric);
  if (local.accepted) return { accepted: true, why: `matched "${local.matched}"`, stage: 1 };
  if (squash(transcript).length === 0) return { accepted: false, why: "nothing said", stage: 1 };
  const verdict = await model(transcript, rubric);
  return { accepted: verdict.accepted, why: verdict.why, stage: 2 };
}

/** The choices offered after one miss: the correct finding first, then the distractors — shuffled by the caller. */
export function choicesFor(rubric: PhraseRubric): string[] {
  return rubric.choices ?? [];
}
