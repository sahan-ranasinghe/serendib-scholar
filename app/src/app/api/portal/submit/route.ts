import { NextRequest, NextResponse } from "next/server";
import { paidCallAllowed } from "@/lib/paidCalls";
import { readFile } from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
import { parseAuthoredScript } from "@/lib/authoredScript";
import { authoredPath } from "@/lib/buildLessonScript";
import { sinhalaNumberName } from "@/lib/sinhalaNumber";
import { upsertLine } from "@/lib/actorStore";

/**
 * "SAY IT YOUR WAY" — the actor records a beat's line in her own words,
 * and if it still teaches the same thing, HER wording becomes canonical.
 *
 * Verification is two-layer, and the numbers layer is deterministic:
 *   1. every number the beat speaks must appear in her recording as the
 *      official sinhalaNumberName words (ල/ළ and spacing normalised) —
 *      a model never judges number names;
 *   2. a text model checks the beat's INTENT survived: same thing asked
 *      or stated, same expected answer, no new claims.
 * On fail she is told exactly which number or intent drifted, and offered
 * the original text back.
 *
 * WHERE THE RESULT GOES changed with remote recording. This route used to
 * rewrite src/data/lessons/authored/maths-5-1.json and refuse to run in
 * production — which made the feature useless to an actor working from her
 * own room against the deployed site. Her wording now lands in the
 * `actor_lines` table: it survives a deploy, the builder reads it when
 * composing the script, and scripts/export-actor-lines.ts folds accepted
 * rows back into the authored JSON when a human is ready to take them.
 */

const TRANSCRIBE_MODEL = process.env.GEMINI_HEAR_MODEL ?? "gemini-3.6-flash";

function normalise(text: string): string {
  return text.replace(/ල/gu, "ළ").replace(/[  ]/gu, " ").replace(/\s+/gu, " ").trim();
}

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    preserved: { type: "boolean" },
    drift: { type: "string", description: "Empty when preserved; else what changed, in one sentence." },
  },
  required: ["preserved", "drift"],
} as const;

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // "Say it your way" transcribes and checks a take with a model: a paid call, off unless PORTAL_TRANSCRIBE=on.
  if (!paidCallAllowed("portalTranscribe")) return NextResponse.json({ ok: false, error: "Checking a re-worded take is switched off (PORTAL_TRANSCRIBE is not on). Record the line as written." }, { status: 503 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "GEMINI_API_KEY is not set." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const beatId = typeof body.beat_id === "string" ? body.beat_id : "";
  const audio = typeof body.audio === "string" ? body.audio : "";
  if (!beatId || !audio) return NextResponse.json({ ok: false, error: "beat_id and audio are required." }, { status: 400 });

  const file = parseAuthoredScript(await readFile(authoredPath("maths", 5, 1), "utf8").catch(() => null));
  const beat = file?.beats.find((candidate) => candidate.id === beatId);
  if (!file || !beat) return NextResponse.json({ ok: false, error: "No such authored beat." }, { status: 404 });

  try {
    const ai = new GoogleGenAI({ apiKey });

    // 1. Verbatim transcription of her take.
    const heard = await ai.models.generateContent({
      model: TRANSCRIBE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Transcribe this Sinhala speech EXACTLY, word for word — a voice actor reading a tutoring line. " +
                "No corrections, no additions. Return only the transcript text.",
            },
            { inlineData: { mimeType: "audio/wav", data: audio } },
          ],
        },
      ],
      config: { maxOutputTokens: 2048 },
    });
    const transcript = (heard.text ?? "").trim();
    if (!transcript) return NextResponse.json({ ok: false, error: "Nothing was heard — try again closer to the mic." });

    // 2. Deterministic number check.
    const missingNumbers: Array<{ number: number; expected: string }> = [];
    for (const value of beat.numbers ?? []) {
      const expected = sinhalaNumberName(value);
      if (!normalise(transcript).includes(normalise(expected))) {
        missingNumbers.push({ number: value, expected });
      }
    }
    if (missingNumbers.length > 0) {
      await upsertLine({
        beat_id: beatId,
        original_text: beat.spokenText,
        actor_text: transcript,
        status: "rejected",
      });
      return NextResponse.json({
        ok: true,
        accepted: false,
        transcript,
        original: beat.spokenText,
        reason: "numbers",
        details: missingNumbers.map(
          (miss) => `${miss.number} must be said exactly as "${miss.expected}" — that wording was not heard.`,
        ),
      });
    }

    // 3. Intent check against the beat's design entry.
    const intentResponse = await ai.models.generateContent({
      model: TRANSCRIBE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "A voice actor re-worded one line of a maths lesson. Decide whether the TEACHING INTENT survived.",
                `Beat type: ${beat.type}. Pause type: ${beat.pauseType ?? "none"}.`,
                beat.expectedAnswer ? `It asks a question whose answer must still be: ${beat.expectedAnswer}` : "It asks no judged question.",
                beat.errorPlanted ? `It deliberately shows this error for the child to find: ${beat.errorPlanted}` : "",
                "",
                `CANONICAL LINE: ${beat.spokenText}`,
                `HER VERSION:    ${transcript}`,
                "",
                "preserved=true only if her version asks/states the same thing (numbers already verified separately),",
                "keeps any question a question with the same answer, and adds no new mathematical claim.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        },
      ],
      config: { responseMimeType: "application/json", responseJsonSchema: INTENT_SCHEMA, maxOutputTokens: 512 },
    });
    const intent = JSON.parse((intentResponse.text ?? "").trim()) as { preserved: boolean; drift: string };
    if (!intent.preserved) {
      await upsertLine({
        beat_id: beatId,
        original_text: beat.spokenText,
        actor_text: transcript,
        status: "rejected",
      });
      return NextResponse.json({
        ok: true,
        accepted: false,
        transcript,
        original: beat.spokenText,
        reason: "intent",
        details: [intent.drift],
      });
    }

    // 4. Accepted: her wording is canonical from here. Stored, not written
    //    to the repo — the builder reads this table when composing the
    //    script, and the text-keyed clip cache re-keys itself.
    await upsertLine({
      beat_id: beatId,
      original_text: beat.spokenText,
      actor_text: transcript,
      status: "accepted",
    });
    return NextResponse.json({ ok: true, accepted: true, transcript, original: beat.spokenText });
  } catch (error) {
    console.error("[portal] submit failed:", error);
    return NextResponse.json({ ok: false, error: "Verification failed — try again." }, { status: 500 });
  }
}
