/**
 * One text-model pass over each explanation row's verbatim transcript,
 * producing `explanation.spokenTranscript` — the EXACT words the tutor will
 * speak (see the transcript-driven EXPLAIN beats in lessonScriptBuilder.ts).
 *
 * The pass ONLY:
 *   (a) converts classroom address to one child — every direct vocative
 *       becomes the literal {address} token (resolved per child at serve
 *       time, see src/lib/addressToken.ts); ඔයාලා → ඔයා,
 *   (b) removes classroom-only asides (homework, "look at your friend's
 *       book", roll-call, managing the room),
 *   (c) fixes obvious transcription errors.
 * NOTHING else changes — her sequence, repetitions, examples, questions and
 * pauses all survive. The result is cached on the row, so this costs one
 * flash call per row, once.
 *
 *   npm run clean:transcripts            # rows missing spokenTranscript
 *   npm run clean:transcripts -- --force # redo all
 */
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "../src/lib/supabaseAdmin";

const MODEL = "gemini-3.6-flash";
const FORCE = process.argv.includes("--force");
/** --only <source>: clean just that row (retrying a failure without re-running all 50). */
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const MAX_OUTPUT_TOKENS = 8192;

const SCHEMA = {
  type: "object",
  properties: {
    spokenTranscript: {
      type: "string",
      description: "The cleaned transcript: same words, same order, same length to within the removed asides.",
    },
  },
  required: ["spokenTranscript"],
} as const;

function buildPrompt(transcript: string): string {
  return [
    "You are cleaning a verbatim Sinhala transcript of a teacher speaking to a CLASSROOM, so a one-to-one",
    "tutor can speak the SAME words to ONE child. Apply ONLY these three changes:",
    "1. Convert classroom address to one child. Every DIRECT VOCATIVE address (පුතාලා, දූලා, පුතේ, දුවේ,",
    "   පුංචි දුවේ පුතේ, ළමයි used as address) becomes the literal token {address} — exactly that string,",
    "   braces included, standing alone as the vocative word. Pronouns become singular: ඔයාලා/හැමෝම → ඔයා;",
    "   plural verb forms to singular. Possessive address forms (පුතාලාගේ, දුවේ පුතේගේ) become ඔයාගේ —",
    "   NEVER {address}ගේ. Do not use the token anywhere except as a standalone vocative.",
    "2. Remove classroom-only asides entirely: homework instructions, referring to other students or their",
    "   books, roll-call, managing the room, 'copy this down before I erase it'.",
    "3. Fix obvious speech-to-text transcription errors (a garbled word whose intended word is clear).",
    "CHANGE NOTHING ELSE. Keep her sequence, her repetitions, her worked examples, her filler words, her",
    "questions, her pauses (the '...' and '.' rhythm) exactly as they are. Do not summarise, do not shorten,",
    "do not improve, do not reorder, do not translate.",
    "",
    "The transcript:",
    transcript,
  ].join("\n");
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const ai = new GoogleGenAI({ apiKey });

  const { data, error } = await supabaseAdmin
    .from("content_bank")
    .select("id, source, concept_tag, explanation")
    .eq("component_type", "explanation");
  if (error) throw new Error(error.message);

  let cleaned = 0,
    skipped = 0,
    failed = 0;
  for (const row of data ?? []) {
    if (ONLY && row.source !== ONLY) continue;
    const explanation = (row.explanation ?? {}) as Record<string, unknown>;
    const transcript = typeof explanation.transcriptExcerpt === "string" ? explanation.transcriptExcerpt : "";
    if (!transcript.trim()) {
      skipped += 1;
      continue;
    }
    if (!FORCE && typeof explanation.spokenTranscript === "string" && explanation.spokenTranscript.trim() !== "") {
      skipped += 1;
      continue;
    }
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: buildPrompt(transcript) }] }],
        config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, maxOutputTokens: MAX_OUTPUT_TOKENS },
      });
      if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error("truncated");
      const raw = (response.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(raw) as { spokenTranscript?: unknown };
      const spoken = typeof parsed.spokenTranscript === "string" ? parsed.spokenTranscript.trim() : "";
      // Sanity: the cleanup must not have rewritten or gutted her speech,
      // and the token must only ever appear as a standalone vocative.
      if (spoken.length < transcript.length * 0.5 || spoken.length > transcript.length * 1.3) {
        throw new Error(`suspicious length ${spoken.length} vs ${transcript.length}`);
      }
      if (/\{address\}[^\s,.!?]/u.test(spoken)) {
        throw new Error("token used with an attached suffix");
      }
      if (/පුතාලා|දූලා|ඔයාලා|ළමයි/u.test(spoken)) {
        throw new Error("classroom address survived the cleanup");
      }
      const { error: updateError } = await supabaseAdmin
        .from("content_bank")
        .update({ explanation: { ...explanation, spokenTranscript: spoken } })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      cleaned += 1;
      console.log(`  ${row.source.padEnd(22)} ${row.concept_tag.padEnd(24)} ${transcript.length} → ${spoken.length} chars`);
    } catch (err) {
      failed += 1;
      console.error(`  FAILED ${row.source} (${row.concept_tag}): ${String(err).slice(0, 120)}`);
    }
  }
  console.log(`\nspokenTranscript: ${cleaned} cleaned, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
