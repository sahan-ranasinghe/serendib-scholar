import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

/**
 * What the child just said — one request, one answer.
 *
 * This replaces the live session's streaming transcription for QUESTIONS.
 * The app records the answer window itself (mic opens, silence ends it),
 * posts the clip here, and gets back a transcript plus the number in it,
 * if any. That number is what the planner judges, so the important job of
 * this route is not eloquence but digits: a child saying "දෙදාහ තුන්සිය
 * එකොළහ" must come back as 2311.
 *
 * Nothing about the child is stored here; the clip is used and dropped.
 */

const MODEL = process.env.GEMINI_HEAR_MODEL ?? "gemini-3.6-flash";
/** A generous ceiling on a single spoken answer (the client caps recording at 8s). */
const MAX_AUDIO_BYTES = 2_000_000;

const SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string", description: "Exactly what the child said, in Sinhala. Empty string if silence." },
    number: {
      type: "string",
      description: "The number they said, in digits (e.g. 2311). Empty string if they did not say a number.",
    },
    confidence: { type: "number", description: "0..1 — how clearly this was heard." },
  },
  required: ["transcript", "number", "confidence"],
} as const;

const PROMPT = [
  "This is a 10-year-old Sri Lankan child answering their tutor's question, in Sinhala.",
  "Write down EXACTLY what they said — their words, not a correction or an improvement.",
  "If they said a number in words, also give it in digits: දෙදාස් තුන්සිය එකොළහ → 2311, පනස් හතර → 54.",
  "Sinhala number words can run together in speech; prefer the reading a child would mean.",
  "If the audio is silence, breathing or background noise, return an empty transcript and confidence 0.",
  "Never invent an answer, and never fill in what you think the right answer would be.",
].join("\n");

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "GEMINI_API_KEY is not set." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const audio = typeof body.audio === "string" ? body.audio : "";
  const mimeType = typeof body.mime_type === "string" ? body.mime_type : "audio/wav";
  if (!audio) {
    return NextResponse.json({ ok: false, error: "No audio supplied." }, { status: 400 });
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, error: "Audio clip is too long." }, { status: 413 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: PROMPT }, { inlineData: { mimeType, data: audio } }],
        },
      ],
      config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, maxOutputTokens: 512 },
    });
    const raw = (response.text ?? "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as { transcript?: unknown; number?: unknown; confidence?: unknown };
    const transcript = typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
    const digits = typeof parsed.number === "string" ? parsed.number.replace(/[^\d]/g, "") : "";
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    return NextResponse.json({ ok: true, transcript, number: digits || null, confidence });
  } catch (error) {
    console.error("[hear] Could not transcribe the answer:", error);
    // A failure here must not end the lesson: the runtime treats an empty
    // transcript as "nothing heard" and walks the silence ladder.
    return NextResponse.json({ ok: true, transcript: "", number: null, confidence: 0, degraded: true });
  }
}
