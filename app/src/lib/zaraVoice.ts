/**
 * Zara's voice, PINNED — one name, used by every path that produces her
 * speech: the cached-clip renderer, the on-demand line renderer, and the
 * on-request live chat. Without an explicit prebuilt voice the Live API
 * picks one per session (observed live: the voice changed mid-lesson,
 * sometimes to a male one).
 *
 * An empty ZARA_VOICE must NEVER reach speechConfig as an empty
 * voiceName — that hands the choice back to the server. Audition
 * candidates with `npm run audition:voice`, then set ZARA_VOICE.
 */
const DEFAULT_VOICE = "Aoede";

export const ZARA_VOICE: string = (() => {
  const configured = (process.env.ZARA_VOICE ?? "").trim();
  if (configured) return configured;
  if (process.env.ZARA_VOICE !== undefined) {
    console.warn(`[zaraVoice] ZARA_VOICE is set but empty — using the code default "${DEFAULT_VOICE}".`);
  }
  return DEFAULT_VOICE;
})();
