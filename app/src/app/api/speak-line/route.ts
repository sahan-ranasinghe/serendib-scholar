import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { ensureAudioBucket, ensureClip, readCachedClip } from "@/lib/liveTts";
import { getActiveChild } from "@/lib/activeChild";
import { resolveAddress } from "@/lib/addressToken";
import { requireSession } from "@/lib/sessionAuth";
import { limitedResponseBody, takeBudget } from "@/lib/rateLimit";

/**
 * One spoken line, on demand.
 *
 * Almost everything the tutor says is rendered ahead of time
 * (scripts/render-lesson-audio.ts). This route covers the rest:
 *
 *  - `text` given → render THOSE words (a scripted line the batch render
 *    hasn't reached yet, or a deterministic runtime line like CONFIRM).
 *  - `goal` given → a small text model writes the Sinhala first. That is
 *    only for lines that genuinely cannot be written in advance, i.e.
 *    RETEACH: re-explaining the exact sub-skill this child just missed.
 *
 * Either way the result is cached by its resolved text, so the second time
 * the same line is needed it is a storage hit, no model at all.
 */

const WRITER_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.6-flash";

const SCHEMA = {
  type: "object",
  properties: { line: { type: "string", description: "The Sinhala the tutor says. No stage directions." } },
  required: ["line"],
} as const;

async function writeLine(goal: string, maxSentences: number, apiKey: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: WRITER_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "You write what a warm Sri Lankan primary-school teacher SAYS to one 10-year-old child, in Sinhala.",
              `Write at most ${maxSentences} short sentence(s) for this moment:`,
              goal,
              "Plain spoken Sinhala only — what she says out loud, nothing else. No English, no stage directions,",
              "no lists, no markdown, no instructions to the child about buttons or the app.",
              "Address the child as ඔයා. Do not use පුතේ or දුවේ.",
            ].join("\n"),
          },
        ],
      },
    ],
    // The same budget the planner gives this model: a thinking model spends
    // output tokens before it answers, and 512 left the RETEACH line empty
    // ("Unexpected end of JSON input") in a real run.
    config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, maxOutputTokens: 2048 },
  });
  const raw = (response.text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (!raw) throw new Error(`the writer returned no text (finishReason ${response.candidates?.[0]?.finishReason ?? "unknown"})`);
  const parsed = JSON.parse(raw) as { line?: unknown };
  const line = typeof parsed.line === "string" ? parsed.line.trim() : "";
  if (!line) throw new Error("the writer returned nothing");
  return line;
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const apiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!apiKey || !supabaseUrl) {
    return NextResponse.json({ ok: false, error: "Server audio configuration is incomplete." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const givenText = typeof body.text === "string" ? body.text.trim() : "";
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const maxSentences = typeof body.max_sentences === "number" ? Math.max(1, Math.min(4, body.max_sentences)) : 2;

  try {
    // The address form is resolved HERE, before hashing: a clip is keyed
    // by the words that are actually spoken.
    const child = await getActiveChild();
    let text = givenText ? resolveAddress(givenText, child.gender) : "";
    let written = false;
    if (!text) {
      if (!goal) return NextResponse.json({ ok: false, error: "Nothing to say." }, { status: 400 });
      text = resolveAddress(await writeLine(goal, maxSentences, apiKey), child.gender);
      written = true;
    }

    // The clip itself is fetched through /api/clip/<key> (signed URL,
    // session required) — this route hands back the key, never a public URL.
    const cached = await readCachedClip(text);
    if (cached) {
      return NextResponse.json({
        ok: true,
        text,
        written,
        from_cache: true,
        key: cached.key,
        duration_ms: cached.durationMs,
        sentences: cached.sentences,
      });
    }

    // CLIP_RENDER=off: a harness (or a pilot with no render budget) never
    // reaches the voice model — an unrecorded line is read on the board
    // instead (the runtime's no-clip path), and nothing is billed.
    if (process.env.CLIP_RENDER === "off") return NextResponse.json({ ok: false, error: "Rendering is off; the line has no clip yet." }, { status: 503 });

    // Only an actual render (a voice-model call) spends the budget — cache
    // hits above are free. 20 per session; a healthy session renders 0-2
    // (RETEACH lines and unusual CONFIRM values).
    const sessionKey = typeof body.session_id === "string" ? body.session_id.slice(0, 40) : session.child_id;
    const budget = await takeBudget(`render:${sessionKey}`, 20, 4 * 60 * 60);
    if (!budget.allowed) return NextResponse.json(limitedResponseBody(), { status: 429 });

    await ensureAudioBucket();
    const clip = await ensureClip(text, apiKey);
    return NextResponse.json({
      ok: true,
      text,
      written,
      from_cache: false,
      key: clip.key,
      duration_ms: clip.durationMs,
      sentences: clip.sentences,
    });
  } catch (error) {
    console.error("[speak-line] Could not produce the line:", error);
    return NextResponse.json({ ok: false, error: "Could not produce that line." }, { status: 500 });
  }
}
