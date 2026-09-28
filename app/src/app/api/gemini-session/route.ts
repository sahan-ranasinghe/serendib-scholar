import { NextRequest, NextResponse } from "next/server";
import { paidCallAllowed } from "@/lib/paidCalls";
import { ZARA_VOICE as SHARED_ZARA_VOICE } from "@/lib/zaraVoice";
import { requireSession } from "@/lib/sessionAuth";
import { chatBudgetExempt, devMode, openChatBudget, settleChatBudget, view } from "@/lib/chatBudget";
import { readChildExtras } from "@/lib/childStore";
import { COPY } from "@/lib/appCopy";
import { GoogleGenAI, Modality } from "@google/genai";
import { buildSystemPrompt } from "@/lib/prompt";
import { CHAT_BOARD_TOOLS, GEMINI_LIVE_TOOLS } from "@/lib/geminiLiveTools";
import { chatContextPrompt, sanitizeChatContext, type ChatContext } from "@/lib/chatContext";
import { getAvailableSubjects, type AvailableSubject } from "@/lib/availableSubjects";

export const GEMINI_LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";

/**
 * Zara's voice, PINNED. Without an explicit prebuilt voice the Live API
 * picks per-session (and can even drift mid-conversation — observed live:
 * the voice changed, sometimes to a male one). The name is locked into the
 * ephemeral token's constraints, so the client cannot vary it. Audition
 * candidates with `npm run audition:voice`, then set ZARA_VOICE.
 */
const ZARA_VOICE = SHARED_ZARA_VOICE;



/**
 * Mints a short-lived ephemeral token the browser can use to open a Live API
 * WebSocket session directly with Gemini — the real GEMINI_API_KEY never
 * leaves this server. The model, system prompt, tools, and voice config are
 * locked into the token itself via liveConnectConstraints (see the comment
 * on tokenConfig below for why lockAdditionalFields is deliberately unset),
 * so a compromised or tampered client can't swap out the system prompt or
 * tool set.
 */
/**
 * THE ✋ CHAT'S DAILY BUDGET (28 Sep 2026, src/lib/chatBudgetRules.ts). It used to charge a flat 5 minutes per opening
 * against a 15-minute day — three openings, then a silent 429 and a panel that flashed shut. Now the day is the parent's
 * choice (15 / 30 / 60 minutes, 30 by default), an opening HOLDS what it may use (at most 10 minutes) and the client
 * settles the connected time at /api/chat-usage (at least 15 s). DEV_MODE is exempt (src/lib/chatBudget.ts).
 *
 * A refusal is never silent: the 429 carries the line Zara says on the panel.
 */

export async function POST(request: NextRequest) {
  // Defense in depth behind the proxy: minting a Live token spends money.
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const limitSeconds = (await readChildExtras(session.child_id)).settings.chatMinutes * 60;
  const exempt = chatBudgetExempt(request);
  let openId: string | null = null;
  let allowedSeconds = Math.min(limitSeconds, 10 * 60);
  let budget = view(limitSeconds, 0, exempt);
  if (!exempt) {
    const opening = await openChatBudget(session.child_id, limitSeconds);
    if (!opening.allowed) {
      return NextResponse.json({ ok: false, error: "chat_budget_spent", message: COPY["chat.outOfTime"].si, budget: opening.budget }, { status: 429 });
    }
    openId = opening.openId;
    allowedSeconds = opening.allowedSeconds;
    budget = opening.budget;
  }
  const chat = { openId, allowedSeconds, budget };
  // DEV_MODE only: the harness's chat drill — the budget is real, the token is not (no call to Google is made; the page's
  // WebSocket is the harness's own fake).
  if (devMode() && request.cookies.get("ss_chat_mock")?.value === "on") {
    return NextResponse.json({ ok: true, token: "mock", model: GEMINI_LIVE_MODEL, mock: true, chat });
  }
  // The one permitted paid call in the app (src/lib/paidCalls.ts) — counted, so a harness can tell it from any other.
  paidCallAllowed("chat");
  /** The chat never started: the whole hold goes back. */
  const release = async () => {
    if (openId) await settleChatBudget(session.child_id, openId, null, limitSeconds);
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await release();
    return NextResponse.json(
      { ok: false, error: "GEMINI_API_KEY is not configured on the server" },
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
  // Where the child is: the lesson's own context, trimmed server-side, so
  // the chat opens on the board they are looking at.
  let context: ChatContext | null = null;
  try {
    const body = (await request.json().catch(() => null)) as { context?: unknown } | null;
    context = sanitizeChatContext(body?.context);
  } catch {
    context = null;
  }
  const systemPrompt = buildSystemPrompt(availableSubjects) + (context ? chatContextPrompt(context) : "");

  const tokenConfig = {
    uses: 1,
    expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
    liveConnectConstraints: {
      model: GEMINI_LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ functionDeclarations: [...GEMINI_LIVE_TOOLS, ...CHAT_BOARD_TOOLS] }],
        outputAudioTranscription: {},
        // A language hint for the input transcription (the SDK's AudioTranscriptionConfig.languageCodes). The channel is
        // known to misdetect the language on its own; the hint helps the overlay's copy, and nothing child-facing relies on
        // it — the chat panel never shows the transcript (SessionShell's ChatPanel).
        inputAudioTranscription: { languageCodes: ["si-LK"] },
        // One voice, forever: pinned here and locked by the token (the
        // whole LiveConnectConfig is locked — see the lockAdditionalFields
        // note below), so neither the client nor a reconnect can produce a
        // different voice. A fresh session mints a fresh token from this
        // same config, and API-side session resumption preserves the
        // original session's config by definition.
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ZARA_VOICE } } },
        // Natural turn-taking: the API's own voice-activity detection is
        // ON. The client gates what the mic SENDS instead (see
        // useLiveChat.ts): the chat is full duplex, so the child may interrupt,
        // so teaching beats cannot be interrupted by noise, and chat beats
        // allow barge-in.
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
      ok: true,
      token: token.name,
      model: GEMINI_LIVE_MODEL,
      expireTime: token.expireTime,
      voice: ZARA_VOICE,
      chat,
    });
  } catch (error) {
    console.error("[gemini-session] Failed to mint ephemeral token:", error);
    await release();
    return NextResponse.json(
      { ok: false, error: "Failed to start a study session. Please try again." },
      { status: 500 },
    );
  }
}
