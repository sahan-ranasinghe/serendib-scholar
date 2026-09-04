/**
 * LIVE-ONLY-WHEN-NEEDED policy — groundwork for the audio split.
 *
 * The Live connection is only strictly necessary when the child can talk:
 * chat, an open ASK/SOFT_CHECK window, or judging an answer. Long scripted
 * EXPLAIN runs are fixed words that will eventually play from cached audio,
 * at which point keeping the socket open through them is pure cost.
 *
 * Policy (evaluated at each scripted serve):
 *   - if ≥ LIVE_IDLE_THRESHOLD_S seconds of consecutive NON-INTERACTIVE
 *     beats lie ahead, AND every beat in that run has cached audio, the
 *     Live session may be closed and re-opened PREOPEN_LEAD_S seconds
 *     before the next interactive beat.
 *   - hasCachedAudio() is a stub returning false until the cached-audio
 *     pipeline exists, so today the policy never actually closes anything —
 *     it only logs what it WOULD do (see the live-policy logEvent in
 *     useGeminiLive.ts) and records connection metrics per session.
 */
import type { Beat, LessonScript, OrchestratorState } from "@/lib/lessonOrchestrator";
import { beatSpec, estimateBeatSeconds } from "@/lib/beatRegistry";

/** Close Live only when at least this much non-interactive runway lies ahead. */
export const LIVE_IDLE_THRESHOLD_S = 60;
/** Re-open the Live session this long before the next interactive beat. */
export const PREOPEN_LEAD_S = 3;

/** A beat the child may respond to — the Live session must be up for these. */
export function isInteractiveBeat(beat: Beat): boolean {
  if (beat.endBy === "asking") return true;
  const handling = beatSpec(beat.type).onChildResponse;
  return handling === "judge" || handling === "chat" || handling === "acknowledge";
}

/** Does pre-rendered audio exist for this beat? Stub until the audio split lands. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function hasCachedAudio(_beat: Beat): boolean {
  return false;
}

export interface LiveLookahead {
  /** Seconds of consecutive non-interactive beats starting at the current position. */
  nonInteractiveSeconds: number;
  /** Every beat in that run has cached audio (required to actually close Live). */
  runFullyCached: boolean;
  /** Seconds until the next interactive beat (Infinity if none remain). */
  nextInteractiveInSeconds: number;
}

/**
 * Looks ahead from the current script position (pending inserted beats
 * first — they play before the script resumes) and measures the
 * non-interactive runway.
 */
export function liveLookahead(
  script: LessonScript,
  state: OrchestratorState,
  pendingBeats: Beat[] = [],
): LiveLookahead {
  const upcoming: Beat[] = [...pendingBeats, ...script.beats.slice(state.beatIndex)];
  let nonInteractiveSeconds = 0;
  let runFullyCached = true;
  let nextInteractiveInSeconds = Infinity;
  for (const beat of upcoming) {
    if (isInteractiveBeat(beat)) {
      nextInteractiveInSeconds = nonInteractiveSeconds;
      break;
    }
    nonInteractiveSeconds += estimateBeatSeconds(beat);
    if (!hasCachedAudio(beat)) runFullyCached = false;
  }
  return { nonInteractiveSeconds, runFullyCached, nextInteractiveInSeconds };
}

/**
 * True when the Live session could be closed right now under the policy.
 * Today always false (hasCachedAudio is a stub) — callers log the verdict
 * so the behaviour is observable before it is ever enabled.
 */
export function shouldSuspendLive(lookahead: LiveLookahead): boolean {
  return lookahead.nonInteractiveSeconds >= LIVE_IDLE_THRESHOLD_S && lookahead.runFullyCached;
}
