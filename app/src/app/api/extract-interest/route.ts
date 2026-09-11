import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";

/**
 * After the child's reply to the BREAK_CHAT question, a small TEXT model pulls
 * out any interest they mentioned ("my brother has a bicycle", "I watched
 * Spider-Man") and merges it into child_profile.interests — which is what
 * lets later openers ask about things this child actually cares about.
 *
 * Fire-and-forget from the runtime: a failure here costs a slightly more
 * generic opener next week, nothing more. Never blocks the lesson.
 */

const MODEL = "gemini-3.6-flash";
const MAX_OUTPUT_TOKENS = 1024;
const MAX_INTERESTS_KEPT = 12;

const SCHEMA = {
  type: "object",
  properties: {
    interests: {
      type: "array",
      items: { type: "string", maxLength: 40 },
      description:
        "Concrete things the child showed interest in — a sport, show, animal, hobby, food. Short noun " +
        "phrases in the language they used. Empty if the reply mentions nothing of the kind. NEVER include " +
        "personal details: no names, places, family circumstances, or anything sensitive.",
    },
  },
  required: ["interests"],
} as const;

export async function POST(request: NextRequest) {
  const { transcript } = await request.json();
  if (typeof transcript !== "string" || !transcript.trim()) {
    return NextResponse.json({ ok: false, error: "transcript (non-empty string) is required" }, { status: 400 });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: true, interests: [] });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "A child answered a friendly 'how was your day' question in a tutoring app. Extract any " +
                "interests they mentioned, per the schema. Judge conservatively — only things they clearly " +
                `showed liking for.\n\nThe child said (Sinhala, auto-transcribed): ${transcript.slice(0, 400)}`,
            },
          ],
        },
      ],
      config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, maxOutputTokens: MAX_OUTPUT_TOKENS },
    });
    if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error("interest extraction truncated");
    const raw = (response.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as { interests?: unknown };
    const found = Array.isArray(parsed.interests)
      ? parsed.interests.filter((i): i is string => typeof i === "string" && i.trim() !== "").map((i) => i.trim())
      : [];
    if (found.length === 0) return NextResponse.json({ ok: true, interests: [] });

    const childId = await getActiveChildId();
    const { data: profile } = await supabaseAdmin
      .from("child_profile")
      .select("interests")
      .eq("child_id", childId)
      .maybeSingle();
    const existing = Array.isArray(profile?.interests)
      ? (profile!.interests as unknown[]).filter((i): i is string => typeof i === "string")
      : [];
    // Case-insensitive merge, newest last, capped.
    const merged = [...existing];
    for (const interest of found) {
      if (!merged.some((known) => known.toLowerCase() === interest.toLowerCase())) merged.push(interest);
    }
    const capped = merged.slice(-MAX_INTERESTS_KEPT);

    const { error } = await supabaseAdmin
      .from("child_profile")
      .upsert({ child_id: childId, interests: capped }, { onConflict: "child_id" });
    if (error) console.error("[extract-interest] Profile write failed:", error.message);

    return NextResponse.json({ ok: true, interests: found });
  } catch (error) {
    console.error("[extract-interest] Failed:", error);
    return NextResponse.json({ ok: true, interests: [] });
  }
}
