import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { buildSystemPrompt } from "@/lib/prompt";
import { GEMINI_LIVE_TOOLS } from "@/lib/geminiLiveTools";
import { getAvailableSubjects, type AvailableSubject } from "@/lib/availableSubjects";

export const GEMINI_LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";

/**
 * Experimental: keep the API's own voice-activity detection on, so the two
 * chat beat types can run open-mic. Default OFF: automatic detection is
 * disabled and the client marks the child's turns explicitly
 * (push-to-talk), so mic noise can never interrupt a teaching beat.
 */
const OPEN_MIC_CHAT = process.env.OPEN_MIC_CHAT === "true";

/**
 * Mints a short-lived ephemeral token the browser can use to open a Live API
 * WebSocket session directly with Gemini — the real GEMINI_API_KEY never
 * leaves this server. The model, system prompt, tools, and voice config are
 * locked into the token itself via liveConnectConstraints (see the comment
 * on tokenConfig below for why lockAdditionalFields is deliberately unset),
 * so a compromised or tampered client can't swap out the system prompt or
 * tool set.
 */
export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server" },
      { status: 500 },
    );
  }

  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });

  // Fail safe: if this lookup fails, treat it as "nothing available" rather
  // than falling back to some default subject list — claiming coverage that
  // doesn't exist is exactly the bug this is meant to prevent.
  let availableSubjects: AvailableSubject[] = [];
  try {
    availableSubjects = await getAvailableSubjects();
  } catch (error) {
    console.error("[gemini-session] Failed to look up available subjects:", error);
  }
  const systemPrompt = buildSystemPrompt(availableSubjects);

  const tokenConfig = {
    uses: 1,
    expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
    liveConnectConstraints: {
      model: GEMINI_LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ functionDeclarations: GEMINI_LIVE_TOOLS }],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        ...(OPEN_MIC_CHAT
          ? {}
          : { realtimeInputConfig: { automaticActivityDetection: { disabled: true } } }),
      },
    },
    // Deliberately omitted: `lockAdditionalFields`. Leaving it unset locks
    // ALL of LiveConnectConfig (the SDK's "Case 2" — see the create() jsdoc
    // in node_modules/@google/genai/dist/node/node.d.ts), which is what we
    // want: the client can't override model/systemInstruction/tools at all.
    //
    // Setting `lockAdditionalFields: []` instead ("Case 4" — lock only the
    // fields present above) looked more precise, but it makes the SDK
    // auto-generate a field_mask by walking our config's *keys*. That
    // walker treats array-valued fields as objects and emits nonsense
    // paths like "tools.0" (from Object.keys() on the tools array), which
    // the API rejects with:
    //   "field_mask is invalid for BidiGenerateContentSetup"
    // Omitting the field sends no field_mask at all, sidestepping that bug.
  };

  try {
    const token = await ai.authTokens.create({ config: tokenConfig });

    return NextResponse.json({
      token: token.name,
      model: GEMINI_LIVE_MODEL,
      expireTime: token.expireTime,
      // Tells the client whether the session runs manual turn-taking
      // (push-to-talk everywhere) or the experimental open-mic-for-chat
      // mode — the mic gating differs (see useGeminiLive.ts).
      openMicChat: OPEN_MIC_CHAT,
    });
  } catch (error) {
    console.error("[gemini-session] Failed to mint ephemeral token:", error);
    return NextResponse.json(
      { error: "Failed to start a study session. Please try again." },
      { status: 500 },
    );
  }
}
