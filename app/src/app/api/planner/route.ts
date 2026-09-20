import { NextRequest, NextResponse } from "next/server";
import { paidCallAllowed } from "@/lib/paidCalls";
import { GoogleGenAI } from "@google/genai";
import { answersMatch, answerContains } from "@/lib/answerCheck";
import type { PlannerDecision } from "@/lib/lessonOrchestrator";

/**
 * Decides what the lesson should do next after a child answers.
 *
 * Two stages, cheapest first:
 *   1. A deterministic comparison (see answerCheck.ts). An exact match is an
 *      exact match — no model call, no latency, no chance of a model talking
 *      itself out of a correct answer.
 *   2. Only when that's inconclusive — the answer is wrong, or the
 *      transcript contains the right value buried in other words — a small
 *      TEXT model (not the Live model) is asked to judge understanding and
 *      pick a next move.
 *
 * Deliberately a text model: the Live session is a voice conversation with a
 * child in it, and asking it to also step outside and reason about pedagogy
 * mid-turn is what the orchestrator exists to stop.
 */

const PLANNER_MODEL = "gemini-3.6-flash";
// Generous headroom: this model reasons before it answers, and a response
// cut off mid-JSON parses as a failure and silently drops the planner to
// its fallback — confirmed here, with 512.
const MAX_OUTPUT_TOKENS = 2048;
const MAX_TRANSCRIPT_CHARS = 600;

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    understood: {
      type: "boolean",
      description: "Whether the child's answer shows they understand the idea being practised.",
    },
    next: {
      type: "string",
      enum: ["advance", "reteach", "another_example", "simplify"],
      description:
        "advance: they have it, move on. another_example: nearly there, give a fresh problem at this level. " +
        "simplify: they're struggling, drop back to an easier one. reteach: they've missed the idea itself, " +
        "explain it again from the start.",
    },
    reason: {
      type: "string",
      description: "At most one short sentence, for the session log. Never spoken to the child.",
      maxLength: 200,
    },
    ambiguous_number: {
      type: ["string", "null"],
      description:
        "Set ONLY when the transcript probably contains a number answer but the hearing is doubtful — the " +
        "best-guess number as digits (e.g. \"2311\"). Null when the transcript is clear (clearly right, " +
        "clearly wrong, or clearly not a number at all).",
    },
  },
  required: ["understood", "next", "reason", "ambiguous_number"],
} as const;

function buildPrompt(goal: string, expected: string | null, transcript: string): string {
  return [
    "You are the planner for a Grade 5 maths tutoring session in Sri Lanka. A child has just answered.",
    "Decide only what the lesson should do next. You are not speaking to the child and your words are never read aloud.",
    "",
    `What the child was asked to do: ${goal}`,
    expected ? `The correct answer: ${expected}` : "There is no single correct answer recorded for this question.",
    `What the child said (Sinhala speech, auto-transcribed, so it may be imperfect): ${transcript}`,
    "",
    "Judge generously on transcription noise and phrasing, and strictly on the mathematics. A child who says the",
    "right number inside a hesitant sentence has answered correctly. A child who says something unrelated, or asks",
    "a question back, has not answered at all — that is 'another_example' only if they were close, otherwise",
    "'simplify' or 'reteach'.",
    "",
    "Sinhala speech recognition mishears numbers often (දෙදහස්/දහදහස්, තුන්සිය/තුන්දහස…). If the transcript looks",
    "like a number answer but you cannot be confident WHICH number was said — it garbles, mixes digits and words",
    "inconsistently, or is one plausible mishearing away from the correct answer — do NOT judge it wrong: set",
    "ambiguous_number to your best guess as digits, so the tutor can ask the child to confirm before judging.",
    "A doubtful hearing must never be marked wrong.",
  ].join("\n");
}

const RUBRIC_SCHEMA = {
  type: "object",
  properties: {
    accepted: { type: "boolean", description: "True only if the child's words express one of the acceptable findings." },
    why: { type: "string", description: "One short sentence: which finding they expressed, or what was missing." },
  },
  required: ["accepted", "why"],
};

/** Stage 2 for a phrase answer: the rubric and the child's words, nothing else. */
function buildRubricPrompt(rubric: { acceptIfAnyOf: string[]; conceptDescription: string }, said: string): string {
  return [
    "A Grade-5 child in Sri Lanka answered a maths tutor's question in Sinhala (a spoken transcript, possibly imperfect).",
    "Decide only whether their words express the correct finding. You are not speaking to the child.",
    `The concept: ${rubric.conceptDescription}`,
    `Accept if the answer expresses ANY of these findings (in any wording, Sinhala or digits): ${rubric.acceptIfAnyOf.map((t) => `"${t}"`).join(", ")}`,
    "Do not accept an answer that only repeats the question, says the work was fine, or names an unrelated thing.",
    `The child said: "${said}"`,
    "Return JSON: { accepted, why }.",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const { beat_goal, expected, transcript , rubric } = await request.json();

  if (typeof beat_goal !== "string" || !beat_goal.trim()) {
    return NextResponse.json({ ok: false, error: "beat_goal (non-empty string) is required" }, { status: 400 });
  }
  if (typeof transcript !== "string") {
    return NextResponse.json({ ok: false, error: "transcript (string) is required" }, { status: 400 });
  }
  const expectedValue = typeof expected === "string" || typeof expected === "number" ? String(expected) : null;
  const said = transcript.slice(0, MAX_TRANSCRIPT_CHARS);

  // A PHRASE question with a rubric: the runtime already ran the
  // deterministic stage; this is stage 2 — one model call with the rubric.
  if (rubric && typeof rubric === "object" && Array.isArray((rubric as { acceptIfAnyOf?: unknown }).acceptIfAnyOf)) {
    const rubricValue = rubric as { acceptIfAnyOf: string[]; conceptDescription: string };
    const apiKey = paidCallAllowed("planner") ? process.env.GEMINI_API_KEY : undefined; // off unless VOICE_ASSESSMENT=on: the no-model path below answers
    if (!apiKey) {
      const decision: PlannerDecision = { understood: false, next: "advance", reason: "No model available for the rubric; not accepted." };
      return NextResponse.json({ ok: true, decision, checked_by: "rubric-unavailable" });
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: PLANNER_MODEL,
        contents: [{ role: "user", parts: [{ text: buildRubricPrompt(rubricValue, said) }] }],
        config: { responseMimeType: "application/json", responseJsonSchema: RUBRIC_SCHEMA, maxOutputTokens: MAX_OUTPUT_TOKENS },
      });
      const raw = (response.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(raw) as { accepted?: boolean; why?: string };
      if (typeof parsed?.accepted !== "boolean") throw new Error(`Rubric judge returned an unusable verdict: ${raw.slice(0, 200)}`);
      const decision: PlannerDecision = { understood: parsed.accepted, next: "advance", reason: parsed.why ?? "" };
      return NextResponse.json({ ok: true, decision, checked_by: "rubric-model" });
    } catch (error) {
      console.error("[planner] rubric judge failed:", error);
      const decision: PlannerDecision = { understood: false, next: "advance", reason: "Rubric judge failed; not accepted." };
      return NextResponse.json({ ok: true, decision, checked_by: "rubric-failed" });
    }
  }

  // Stage 1 — the confident case.
  if (expectedValue !== null && said.trim() !== "" && answersMatch(expectedValue, said)) {
    const decision: PlannerDecision = { understood: true, next: "advance", reason: "Exact match." };
    return NextResponse.json({ ok: true, decision, checked_by: "exact" });
  }

  // A child who said nothing at all hasn't answered — no need to spend a
  // model call working that out.
  if (said.trim() === "") {
    const decision: PlannerDecision = {
      understood: false,
      next: "simplify",
      reason: "No answer given.",
    };
    return NextResponse.json({ ok: true, decision, checked_by: "empty" });
  }

  // Stage 2 — ambiguous or wrong.
  const apiKey = paidCallAllowed("planner") ? process.env.GEMINI_API_KEY : undefined; // off unless VOICE_ASSESSMENT=on: the no-model path below answers
  if (!apiKey) {
    // Fail toward teaching rather than toward advancing: without a planner
    // we cannot claim the child understood.
    const contained = expectedValue !== null && answerContains(expectedValue, said);
    const decision: PlannerDecision = contained
      ? { understood: true, next: "advance", reason: "Expected value found in the answer (planner unavailable)." }
      : { understood: false, next: "another_example", reason: "Planner unavailable; defaulting to more practice." };
    return NextResponse.json({ ok: true, decision, checked_by: "fallback" });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: PLANNER_MODEL,
      contents: [{ role: "user", parts: [{ text: buildPrompt(beat_goal, expectedValue, said) }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: DECISION_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });
    if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
      // Distinguish this from a malformed response: it means the ceiling is
      // too low, not that the model misbehaved.
      throw new Error(`Planner response hit the ${MAX_OUTPUT_TOKENS}-token ceiling.`);
    }
    const raw = (response.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as PlannerDecision & { ambiguous_number?: string | null };
    if (typeof parsed?.understood !== "boolean" || !["advance", "reteach", "another_example", "simplify"].includes(parsed?.next)) {
      throw new Error(`Planner returned an unusable decision: ${raw.slice(0, 200)}`);
    }
    const decision: PlannerDecision = {
      understood: parsed.understood,
      next: parsed.next,
      reason: parsed.reason,
      ambiguousNumber:
        typeof parsed.ambiguous_number === "string" && parsed.ambiguous_number.trim() !== ""
          ? parsed.ambiguous_number.trim()
          : null,
    };
    return NextResponse.json({ ok: true, decision, checked_by: "model" });
  } catch (error) {
    console.error("[planner] Model call failed:", error);
    const contained = expectedValue !== null && answerContains(expectedValue, said);
    const decision: PlannerDecision = contained
      ? { understood: true, next: "advance", reason: "Expected value found in the answer (planner call failed)." }
      : { understood: false, next: "another_example", reason: "Planner call failed; defaulting to more practice." };
    return NextResponse.json({ ok: true, decision, checked_by: "fallback" });
  }
}
