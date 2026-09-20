/**
 * THE PAID-CALL GATE (18 Sep 2026, the device walk — cluster O).
 *
 * The only paid call this app may make is the ✋ chat's Live session. Every
 * other route that can reach a model asks here first, and the answer is NO
 * unless the server's environment switches that one call on by name:
 *
 *   chat               always — the Live session (its token is minted by /api/gemini-session)
 *   clipRender         CLIP_RENDER=on        the voice model renders a line that has no cached clip
 *   lineWriter         CLIP_RENDER=on        the writer model writes a line to speak (a runtime RETEACH)
 *   planner · hear     VOICE_ASSESSMENT=on   the opt-in reading assessment (judging a hearing, transcribing it)
 *   extractInterest    INTEREST_EXTRACT=on   interests from an onboarding transcript
 *   syllabusEmbedding  SYLLABUS_SEARCH=on    the chat's search tool embeds the question
 *   portalTranscribe   PORTAL_TRANSCRIBE=on  the actor portal checks a take against its line
 *
 * Off is the default EVERYWHERE — a missing variable is "off", in the app,
 * in a harness and in the batch scripts alike (scripts/render-lesson-audio.ts
 * must be run with CLIP_RENDER=on, deliberately). A line with no cached clip
 * is read on the board for as long as saying it would take; nothing is billed.
 *
 * Every refusal and every permitted call is counted (paidCallCounts), so a
 * harness can assert a full session spent nothing.
 */
export type PaidCall = "chat" | "clipRender" | "lineWriter" | "planner" | "hear" | "extractInterest" | "syllabusEmbedding" | "portalTranscribe";

const SWITCH: Record<Exclude<PaidCall, "chat">, string> = {
  clipRender: "CLIP_RENDER",
  lineWriter: "CLIP_RENDER",
  planner: "VOICE_ASSESSMENT",
  hear: "VOICE_ASSESSMENT",
  extractInterest: "INTEREST_EXTRACT",
  syllabusEmbedding: "SYLLABUS_SEARCH",
  portalTranscribe: "PORTAL_TRANSCRIBE",
};

type Counts = { allowed: Partial<Record<PaidCall, number>>; refused: Partial<Record<PaidCall, number>> };
// One tally per server PROCESS: route handlers are bundled apart, so the tally hangs off globalThis, not this module.
const counts: Counts = ((globalThis as unknown as { __paidCallCounts?: Counts }).__paidCallCounts ??= { allowed: {}, refused: {} });

/** May this call be made? Counts the answer either way; a permitted call is logged so it is never silent. */
export function paidCallAllowed(kind: PaidCall, env: Record<string, string | undefined> = process.env): boolean {
  const allowed = kind === "chat" || env[SWITCH[kind]] === "on";
  // Only the real environment is tallied and logged: a test asking "what if the switch were on?" spends nothing.
  if (env !== process.env) return allowed;
  const bucket = allowed ? counts.allowed : counts.refused;
  bucket[kind] = (bucket[kind] ?? 0) + 1;
  if (allowed) console.info(`[paid-call] ${kind}${kind === "chat" ? " (the ✋ chat's Live session — the one permitted paid call)" : ` (${SWITCH[kind]}=on)`}`);
  return allowed;
}

/** The variable that would switch this call on — for the refusal's message. */
export function paidCallSwitch(kind: Exclude<PaidCall, "chat">): string {
  return SWITCH[kind];
}

/** What this server process has allowed and refused since it started. */
export function paidCallCounts(): { allowed: Partial<Record<PaidCall, number>>; refused: Partial<Record<PaidCall, number>> } {
  return { allowed: { ...counts.allowed }, refused: { ...counts.refused } };
}
