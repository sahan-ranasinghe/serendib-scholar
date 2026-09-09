"use client";

import { useCallback, useRef, useState } from "react";
import { PcmPlayer } from "@/lib/pcmAudio";
import { closeRecordingContext, recordAnswer as recordAnswerClip, type AnswerRecorderHandle } from "@/lib/answerRecorder";
import { clipKey, AUDIO_FORMAT_VERSION, type ClipMeta } from "@/lib/audioCache";
import { parseAnswerPredicate } from "@/lib/answerCheck";
import { isNumberWord, sinhalaNumberName } from "@/lib/sinhalaNumber";
import { concatWavClips, numberClipPlan, pcmOfWav, NUMBER_FRAMES, type NumberFrame } from "@/lib/composeNumberAudio";
import { CLIP_SAMPLE_RATE } from "@/lib/audioCache";
import { useLiveChat } from "@/hooks/useLiveChat";
import STORYBOARD_JSON from "@/data/storyboard/maths-5-1-session-1.json";
import {
  alignSpans,
  answerSurfaceFor,
  conceptTitle,
  describeStage,
  eventKey,
  initialStage,
  isKnownEvent,
  reduceStage,
  stageFromLegacy,
  type AlignedSpans,
  type ReduceContext,
  type StageBase,
  type StageState,
  type Storyboard,
  type StoryboardBeat,
  type StoryboardEvent,
} from "@/lib/choreography";
import { AUTHORED_LINES } from "@/lib/authoredLines";
import { confirmValueFor, CONFIRM_LIMIT } from "@/lib/confirmPolicy";
import { judgePhrase } from "@/lib/phraseJudge";
import { renderNumberMarkers } from "@/lib/sinhalaNumber";
import { parseTargetKey } from "@/lib/choreography";
import { serializeStage, type ChatAnswer, type ChatContext } from "@/lib/chatContext";
import type { Target } from "@/components/board/events";
import type { YourTurn } from "@/components/board/BoardStage";
import type { ConceptStop } from "@/components/ProgressStrip";
import type { SessionSummary } from "@/components/SessionSummaryCard";
import {
  advance,
  beatSpec,
  buildConfirmBeat,
  buildFeedbackBeat,
  buildGiveUpBeat,
  buildHookPraiseBeat,
  buildOfferHelpBeat,
  buildReteachBeats,
  buildSoftAckBeat,
  buildWaitBeat,
  buildDirectorLine,
  conceptSummary,
  createInitialState,
  currentBeat as beatAt,
  isLessonComplete,
  resolveConfirmation,
  ASK_SILENCE_TIMEOUT_MS,
  ASK_HELP_TIMEOUT_MS,
  ASK_GIVEUP_TIMEOUT_MS,
  SOFT_CHECK_WINDOW_MS,
  SOFT_CHECK_SILENCE_MS,
  UNAIDED_CORRECT_TO_ADVANCE,
  FRAMING_CONCEPT,
  type AdvanceResult,
  type Beat,
  type LessonScript,
  type OrchestratorState,
  type PlannerDecision,
} from "@/lib/lessonOrchestrator";
import { answersMatch } from "@/lib/answerCheck";
import { resolveBeatAddress, resolveAddress, type ChildGender } from "@/lib/addressToken";
import type { BoardContent } from "@/lib/board";
import { applyViewPatch, conceptsFromScript, type LessonConcept, type ViewPatch } from "@/lib/boardPatch";
import {
  classifyConfirmation,
  fetchRecapBeats,
  fetchResumePoint,
  judgeWithRubric,
  logBeat,
  looksLikeAnswerAttempt,
  recordAnswer as recordMastery,
  runPlanner,
  stageBeatBoard,
} from "@/lib/directorRuntime";

/**
 * THE LESSON RUNTIME — cached audio in, one-shot answers out.
 *
 * The lesson used to run inside a persistent Live voice session: the model
 * held the floor, the app fed it director instructions, and every question
 * depended on that socket noticing the child speak. On real phones it
 * stalled at question windows, every test.
 *
 * So speech and hearing were separated:
 *   - SPEAKING is playback. Every scripted line is pre-rendered in the
 *     pinned voice (scripts/render-lesson-audio.ts) and played from the
 *     clip cache; the few lines that can only be written at runtime go
 *     through /api/speak-line, which renders and caches them too. No model
 *     is in the loop while she teaches.
 *   - HEARING is a request. When a question's window opens the app records
 *     the child (silence ends the recording), posts the clip to /api/hear,
 *     and judges the transcript with the existing planner.
 *   - LIVE is opt-in. A full-duplex voice session exists only for free
 *     conversation the child asks for (see useLiveChat).
 *
 * The orchestrator, the beats, the content bank and the ladder are
 * unchanged — this is the same lesson, driven by a loop that can be
 * watched, logged and reasoned about instead of a conversation that has to
 * be coaxed forward.
 */

export type RuntimeStatus =
  | "idle"
  | "locked"
  | "preparing"
  | "teaching"
  | "listening"
  | "thinking"
  | "chatting"
  | "done"
  | "error";

export interface AnswerPad {
  kind: "number" | "choices";
  options?: string[];
}

/** The character's overriding mood — set by the orchestrator around feedback, never by a timer. */
export type CharacterMood = "none" | "celebrate" | "encourage";

/** A storyboarded beat in flight: its events fire on the clip's sentences. */
interface ActiveChoreo {
  beat: StoryboardBeat;
  /** The board as it was before this beat — a repeat starts from here. */
  snapshot: StageState;
  /** The content-bank item this beat fetched, mapped, for the events that need it. */
  legacy: StageBase;
  /** Sentences whose events have fired. */
  fired: number;
}

/** One line of the choreography trace — what fired, when, against which span. */
export interface ChoreoLogEntry {
  beatId: string;
  sentenceIndex: number;
  event: string;
  /** Audio-clock position within the clip when the event fired. */
  firedAtMs: number;
  spanStartMs: number;
  spanEndMs: number;
  clipMs: number;
  /** The spans were estimated (a clip without matching sentence spans). */
  estimated: boolean;
  /** Fired before its sentence or after the clip ended. */
  outside: boolean;
  /** The board library has this primitive and event. */
  known: boolean;
}

/** Playback needs the pinned voice to NAME a clip (clips come via /api/clip). */
interface AudioConfig {
  voice: string;
}

const MIC_TAIL_MS = 400;

/**
 * Whether a SOFT_CHECK's audio is transcribed.
 *
 * OFF, deliberately. A soft check is not judged — any sound at all earns
 * the same authored "හරි!" — but transcription costs a measured ~5s
 * round trip, and a live run showed 12s between the child chirping and
 * her answering. That silence is the opposite of what a soft check is
 * for. The recording still gates the acknowledgement (she only answers if
 * they actually made a sound); only the words are skipped.
 *
 * Turn this on to put soft-check transcripts back in the session log, at
 * the cost of that pause and one flash-audio call per soft check.
 */
const TRANSCRIBE_SOFT_CHECKS = false;

export function useLessonRuntime(subject = "maths", grade = 5, lesson = 1) {
  const [status, setStatus] = useState<RuntimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [boardContent, setBoardContent] = useState<BoardContent | null>(null);
  const [isAiTalking, setIsAiTalking] = useState(false);
  const [answerPad, setAnswerPad] = useState<AnswerPad | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [lessonConcepts, setLessonConcepts] = useState<LessonConcept[]>([]);
  const [currentConceptTag, setCurrentConceptTag] = useState<string | null>(null);
  const [currentSessionIndex, setCurrentSessionIndex] = useState(0);
  const [sessionCount, setSessionCount] = useState(1);
  const [celebrateNonce, setCelebrateNonce] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);

  // --- the choreography: the storyboard on the board ---------------------
  const [stage, setStageState] = useState<StageState>(initialStage);
  const stageRef = useRef<StageState>(initialStage());
  const [yourTurn, setYourTurn] = useState<YourTurn | null>(null);
  const [characterMood, setCharacterMood] = useState<CharacterMood>("none");
  const [conceptStops, setConceptStops] = useState<ConceptStop[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const storyboardRef = useRef(new Map((STORYBOARD_JSON as Storyboard).beats.map((b) => [b.id, b])));
  const activeChoreoRef = useRef<ActiveChoreo | null>(null);
  /** Events a pause froze: each fires when the audio reaches its sentence again. */
  const frozenRef = useRef<Array<{ run: () => void; startMs: number }>>([]);
  const choreoLogRef = useRef<ChoreoLogEntry[]>([]);
  /** Audio-clock time the current clip started at. */
  const clipStartRef = useRef(0);
  /** This session's mastery log, per concept. */
  const masteryRef = useRef(new Map<string, { asked: number; correct: number; mastered: boolean; done: boolean }>());
  /** Where the child's answer lives on the board, for the feedback burst. */
  const answerTargetRef = useRef<Target | null>(null);
  const sessionStartedAtRef = useRef(0);
  /** The retry ladder: misses per question (never a fourth ask). */
  const missesRef = useRef(new Map<string, number>());
  /** Doubtful hearings confirmed per question (never a third "say it again"). */
  const confirmsRef = useRef(new Map<string, number>());
  /** The last lines she said and the child's last answers — the ✋ chat's context. */
  const recentLinesRef = useRef<string[]>([]);
  const recentAnswersRef = useRef<ChatAnswer[]>([]);
  /** A caption forced up because the line had no clip. */
  const [noClipCaption, setNoClipCaption] = useState<string | null>(null);
  /** A brief on-screen hint (a tap while she talks, a rotation). */
  const [hint, setHint] = useState<string | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Automatic holds (portrait, backgrounded) alongside the parent's ⏸. */
  const holdsRef = useRef(new Set<string>());
  const manualPauseRef = useRef(false);

  const chat = useLiveChat();

  const playerRef = useRef<PcmPlayer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptRef = useRef<LessonScript | null>(null);
  const stateRef = useRef<OrchestratorState>(createInitialState());
  const pendingBeatsRef = useRef<Beat[]>([]);
  const activeBeatRef = useRef<Beat | null>(null);
  const audioConfigRef = useRef<AudioConfig | null>(null);
  const childGenderRef = useRef<ChildGender>("unspecified");
  const sessionIdRef = useRef<string>("");
  const sequenceRef = useRef(0);
  const beatStartedAtRef = useRef<string>(new Date().toISOString());
  const childTranscriptRef = useRef("");
  /** How long the clip for the current beat ran — kept for the session log. */
  const beatAudioMsRef = useRef(0);
  const usedReteachAnglesRef = useRef<string[]>([]);
  const sessionStatsRef = useRef({ concepts: new Set<string>(), correct: 0, asked: 0 });
  const recorderRef = useRef<AnswerRecorderHandle | null>(null);
  const padAnswerRef = useRef<string | null>(null);
  /**
   * The number the child last built on the digit picker (judged correct by
   * a permutation predicate). A "builtNumber" board draws it; the composed
   * number clips speak it. Nothing else knows it — the script cannot.
   */
  const lastBuiltNumberRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const pausedRef = useRef(false);
  const mutedRef = useRef(false);
  const chatRequestedRef = useRef(false);
  const repeatRequestedRef = useRef(false);
  const skipToCloseRef = useRef(false);
  const statusRef = useRef<RuntimeStatus>("idle");
  const debugEventsRef = useRef<string[]>([]);

  /** The audio-cost split this session (item 5). */
  const metricsRef = useRef({ cachedSeconds: 0, flashAudioSeconds: 0, clipsPlayed: 0, clipsRendered: 0 });

  const setRuntimeStatus = (next: RuntimeStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  const logEvent = (event: string) => {
    debugEventsRef.current.push(`${new Date().toISOString().slice(11, 19)} ${event}`);
    if (debugEventsRef.current.length > 20) debugEventsRef.current.shift();
    console.debug(`[beat] ${event}`);
  };

  // -----------------------------------------------------------------
  // The board: stage state, and the storyboard's events on it
  // -----------------------------------------------------------------

  const publishChoreo = () => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { __stage?: string; __choreo?: unknown; __choreoLog?: ChoreoLogEntry[] };
    w.__stage = describeStage(stageRef.current);
    const active = activeChoreoRef.current;
    w.__choreo = active ? { beatId: active.beat.id, fired: active.fired, sentences: active.beat.sentences.length } : null;
    w.__choreoLog = choreoLogRef.current;
  };

  /** A short hint the screen shows for a moment — never a modal, never a block. */
  const showHint = (text: string, ms = 1800) => {
    setHint(text);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(null), ms);
  };

  const setStage = (next: StageState) => {
    stageRef.current = next;
    setStageState(next);
    publishChoreo();
  };

  const dispatchStage = (event: Pick<StoryboardEvent, "primitive" | "event" | "args">, ctx: ReduceContext = {}) => {
    setStage(reduceStage(stageRef.current, event, ctx));
  };

  /** The audio clock's position inside the current clip. */
  const positionMs = () => {
    const debug = playerRef.current?.getPlaybackDebug();
    return debug ? Math.round((debug.currentTime - clipStartRef.current) * 1000) : 0;
  };

  const fireFeedback = (kind: "correct" | "wrong" | "celebrate", at: Target | null) => {
    setStage({ ...stageRef.current, feedback: { kind, at, nonce: stageRef.current.feedback.nonce + 1 } });
  };

  /**
   * One sentence's storyboard events, applied to the board — or, while
   * the lesson is paused, held until the audio reaches that sentence.
   * Every firing is logged against the sentence's span so a run can be
   * checked for events that landed outside their clip.
   */
  const fireSentence = (choreo: ActiveChoreo, index: number, spans: AlignedSpans, clipMs: number) => {
    const span = spans.list[index] ?? { startMs: 0, endMs: clipMs };
    const run = () => {
      for (const event of choreo.beat.events.filter((e) => e.sentenceIndex === index)) {
        const known = isKnownEvent(event);
        if (known) dispatchStage(event, { legacy: choreo.legacy ?? undefined, lastBuilt: lastBuiltNumberRef.current });
        else logEvent(`choreography: no primitive for ${eventKey(event)}`);
        const at = positionMs();
        choreoLogRef.current.push({
          beatId: choreo.beat.id,
          sentenceIndex: index,
          event: eventKey(event),
          firedAtMs: at,
          spanStartMs: span.startMs,
          spanEndMs: span.endMs,
          clipMs,
          estimated: spans.estimated,
          outside: at < span.startMs - 250 || at > clipMs + 250,
          known,
        });
      }
      choreo.fired = Math.max(choreo.fired, index + 1);
      publishChoreo();
    };
    if (pausedRef.current) frozenRef.current.push({ run, startMs: span.startMs });
    else run();
  };

  /** The strip's stops: every concept of the lesson, the current one filling as beats pass. */
  const refreshProgress = () => {
    const script = scriptRef.current;
    if (!script) return;
    const index = stateRef.current.beatIndex;
    const stops: ConceptStop[] = script.concepts
      .filter((concept) => concept.conceptTag !== FRAMING_CONCEPT)
      .map((concept) => {
        const entry = masteryRef.current.get(concept.conceptTag);
        const total = Math.max(1, concept.lastBeat - concept.firstBeat + 1);
        const finished = entry?.done || index > concept.lastBeat;
        const status: ConceptStop["status"] = finished ? (entry?.mastered ? "mastered" : "done") : index >= concept.firstBeat ? "current" : "upcoming";
        return {
          tag: concept.conceptTag,
          title: conceptTitle(concept.conceptTag, concept.description),
          status,
          fraction: status === "current" ? Math.min(1, (index - concept.firstBeat + 1) / total) : status === "upcoming" ? 0 : 1,
        };
      });
    setConceptStops(stops);
  };

  const noteMastery = (tag: string, correct: boolean) => {
    if (!tag || tag === FRAMING_CONCEPT) return;
    const entry = masteryRef.current.get(tag) ?? { asked: 0, correct: 0, mastered: false, done: false };
    masteryRef.current.set(tag, { ...entry, asked: entry.asked + 1, correct: entry.correct + (correct ? 1 : 0) });
  };

  /**
   * A concept finished: confetti once, its stop lights up (a star if it
   * was mastered), and she says the recorded "concept done" line before
   * the lesson moves on.
   */
  const conceptComplete = (tag: string, mastered: boolean) => {
    const entry = masteryRef.current.get(tag) ?? { asked: 0, correct: 0, mastered: false, done: false };
    masteryRef.current.set(tag, { ...entry, mastered: entry.mastered || mastered, done: true });
    logEvent(`concept complete ${tag}${mastered ? " (mastered)" : ""}`);
    fireFeedback("celebrate", null);
    refreshProgress();
    const current = activeBeatRef.current;
    if (!current) return;
    pendingBeatsRef.current.unshift({
      ...current,
      id: `${tag}:concept-done`,
      type: "TRANSITION",
      goal: "The concept is finished (verbatim line).",
      spokenText: AUTHORED_LINES.conceptDone,
      sayCandidates: undefined,
      maxSentences: 1,
      board: { kind: "none" },
      expectedAnswer: undefined,
      answerChoices: undefined,
      endBy: "pausing",
    });
  };

  /** After any advance: did the concept finish, and was it mastered? */
  const noteAdvance = (result: AdvanceResult, beat: Beat | null, decision: PlannerDecision | null, before: OrchestratorState) => {
    if (!result.movedConcept || !beat || beat.conceptTag === FRAMING_CONCEPT || beat.conceptTag === "lessonOpening") return;
    // A concept the packer split across sittings is not finished at the
    // sitting's end — only when no beat of it remains anywhere ahead.
    const script = scriptRef.current;
    const continues = script?.beats.slice(result.state.beatIndex).some((later) => later.conceptTag === beat.conceptTag) ?? false;
    if (continues) return;
    const unaided = before.unaidedCorrect + (decision?.understood && beat.mode === 3 ? 1 : 0);
    conceptComplete(beat.conceptTag, unaided >= UNAIDED_CORRECT_TO_ADVANCE);
  };

  const buildSummary = (): SessionSummary => {
    const script = scriptRef.current;
    const order = script ? script.concepts.map((c) => c.conceptTag) : [...masteryRef.current.keys()];
    const concepts = order
      .filter((tag) => masteryRef.current.has(tag) || sessionStatsRef.current.concepts.has(tag))
      .map((tag) => {
        const entry = masteryRef.current.get(tag) ?? { asked: 0, correct: 0, mastered: false, done: false };
        return { tag, title: conceptTitle(tag, script?.concepts.find((c) => c.conceptTag === tag)?.description), asked: entry.asked, correct: entry.correct, mastered: entry.mastered };
      });
    return {
      concepts,
      asked: sessionStatsRef.current.asked,
      correct: sessionStatsRef.current.correct,
      minutes: Math.max(1, Math.round((Date.now() - sessionStartedAtRef.current) / 60000)),
    };
  };

  // -----------------------------------------------------------------
  // Speech: the clip cache
  // -----------------------------------------------------------------

  /**
   * In-memory clip cache: key → in-flight or resolved clip. Preloading and
   * playback share it, so the preloaded next-three clips are the ones that
   * actually play. Bounded by eviction (a session's working set is small —
   * the current clip plus the preload horizon).
   */
  const clipCacheRef = useRef(new Map<string, Promise<{ text: string; audio: ArrayBuffer; meta: ClipMeta } | null>>());
  const CLIP_CACHE_MAX = 12;

  /** One clip from /api/clip/<key> (302 → 10-min signed URL; fetch follows it). */
  const loadClipByKey = async (key: string, text: string): Promise<{ text: string; audio: ArrayBuffer; meta: ClipMeta } | null> => {
    const metaResponse = await fetch(`/api/clip/${key}?meta=1`);
    if (!metaResponse.ok) return null;
    const meta = (await metaResponse.json()) as ClipMeta;
    const audioResponse = await fetch(`/api/clip/${key}`);
    if (!audioResponse.ok) return null;
    return { text, audio: await audioResponse.arrayBuffer(), meta };
  };

  /**
   * Resolves a line to a playable clip, via the session-gated clip door
   * (/api/clip → signed URL; the bucket itself is private). A miss — a
   * line the batch render hasn't reached, or one written at runtime —
   * falls back to /api/speak-line, which renders, caches, and hands back
   * the key.
   */
  const fetchClip = (
    text: string,
    fallback: { goal?: string; maxSentences?: number } = {},
  ): Promise<{ text: string; audio: ArrayBuffer; meta: ClipMeta } | null> => {
    const config = audioConfigRef.current;
    const cacheKey = text && config ? clipKey(text, config.voice) : `goal:${fallback.goal ?? ""}`;
    const cached = clipCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const load = (async () => {
      if (text && config) {
        try {
          const clip = await loadClipByKey(clipKey(text, config.voice), text);
          if (clip) {
            metricsRef.current.clipsPlayed += 1;
            return clip;
          }
        } catch {
          // fall through to the render route
        }
      }
      try {
        const response = await fetch("/api/speak-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            goal: fallback.goal,
            max_sentences: fallback.maxSentences ?? 2,
            session_id: sessionIdRef.current,
          }),
        });
        const payload = await response.json();
        if (!payload?.ok) throw new Error(payload?.error ?? "no clip");
        metricsRef.current.clipsPlayed += 1;
        if (!payload.from_cache) metricsRef.current.clipsRendered += 1;
        logEvent(`render ${payload.from_cache ? "cache" : "NEW"} "${String(payload.text).slice(0, 30)}…"`);
        const clip = await loadClipByKey(payload.key as string, payload.text as string);
        if (!clip) throw new Error("rendered clip not fetchable");
        return clip;
      } catch (err) {
        console.error("[useLessonRuntime] Could not get a clip for:", text.slice(0, 60), err);
        clipCacheRef.current.delete(cacheKey); // never cache a failure
        return null;
      }
    })();

    clipCacheRef.current.set(cacheKey, load);
    // Evict oldest entries beyond the horizon (Map preserves insert order).
    while (clipCacheRef.current.size > CLIP_CACHE_MAX) {
      const oldest = clipCacheRef.current.keys().next().value;
      if (oldest === undefined) break;
      clipCacheRef.current.delete(oldest);
    }
    return load;
  };

  /** Warms the cache for a line we're about to need (same path playback uses). */
  const prefetchClip = (text: string | undefined) => {
    if (!text || !audioConfigRef.current) return;
    void fetchClip(text);
  };

  /** The exact words this beat speaks, address token resolved. */
  const lineFor = (beat: Beat): string | null => {
    if (beat.spokenText) return beat.spokenText;
    if (beat.sayCandidates && beat.sayCandidates.length > 0) {
      // Deterministic per beat id, so a repeat says the same thing.
      const index = [...beat.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % beat.sayCandidates.length;
      return beat.sayCandidates[index];
    }
    return null;
  };

  /** Speaks one beat and returns when the audio has finished. */
  const speak = async (beat: Beat): Promise<void> => {
    const player = playerRef.current;
    if (!player || stoppedRef.current) return;
    const text = lineFor(beat);
    const clip = await fetchClip(text ?? "", {
      // Only beats with no fixed words need a line written for them: today
      // that is RETEACH (re-explaining the sub-skill this child missed).
      goal: text ? undefined : buildDirectorLine(beat),
      maxSentences: beat.maxSentences,
    });
    if (stoppedRef.current) return;
    if (!clip) {
      // No clip at all (not cached, and the render budget is spent): the
      // board still follows the storyboard, on spans estimated from the
      // sentences, over the time the line would have taken — a silent beat
      // is not a skipped one.
      const silent = activeChoreoRef.current?.beat.id === beat.id ? activeChoreoRef.current : null;
      if (silent) {
        const spans = alignSpans(null, silent.beat.sentences);
        const durationMs = spans.list[spans.list.length - 1]?.endMs ?? 0;
        logEvent(`no clip for ${beat.id.slice(0, 40)} — choreography on estimated spans (${durationMs}ms)`);
        setCaption(text ?? "");
        // Visible, not silent: the line she cannot say is read on the board.
        setNoClipCaption(text ?? null);
        if (text) recentLinesRef.current.push(text);
        clipStartRef.current = player.getPlaybackDebug().currentTime;
        fireSentence(silent, 0, spans, durationMs);
        for (let index = 1; index < spans.list.length; index += 1) {
          const at = spans.list[index]!.startMs;
          setTimeout(() => fireSentence(silent, index, spans, durationMs), at);
        }
        await wait(durationMs + MIC_TAIL_MS);
        setNoClipCaption(null);
      } else {
        // A beat written at runtime (RETEACH) with no line to show: the
        // trace says so, and what follows (the demo, the re-ask) carries on.
        logEvent(`no clip for ${beat.id.slice(0, 40)} (${beat.type}) — nothing to say or show, moving on`);
      }
      return;
    }
    setCaption(clip.text);
    setNoClipCaption(null);
    recentLinesRef.current.push(clip.text);
    if (recentLinesRef.current.length > 6) recentLinesRef.current.shift();
    beatAudioMsRef.current += clip.meta.durationMs;
    metricsRef.current.cachedSeconds += clip.meta.durationMs / 1000;
    // The choreography: this beat's storyboard events, on the clip's own
    // sentence spans — estimated from the sentences when the clip has none
    // that fit. Sentence 0 fires as the clip starts; the rest on the
    // player's sentence boundaries.
    const choreo = activeChoreoRef.current?.beat.id === beat.id ? activeChoreoRef.current : null;
    const spans = choreo ? alignSpans(clip.meta, choreo.beat.sentences) : null;
    const debug = player.getPlaybackDebug();
    clipStartRef.current = Math.max(debug.currentTime, debug.lastScheduledEnd);
    if (choreo && spans) fireSentence(choreo, 0, spans, clip.meta.durationMs);
    const sentences = spans ? spans.list : clip.meta.sentences;
    await player.playClip(clip.audio, {
      sentences,
      onSentence: (index) => {
        if (index > 0) logEvent(`sentence ${index + 1}/${sentences.length}`);
        if (choreo && spans && index > 0) fireSentence(choreo, index, spans, clip.meta.durationMs);
      },
    });
    // The echo guard the mic path relied on before: never start listening
    // over the tail of her own voice.
    await wait(MIC_TAIL_MS);
  };

  // -----------------------------------------------------------------
  // Hearing: one recording, one request
  // -----------------------------------------------------------------

  /**
   * Opens the child's window and waits for an answer: the mic records
   * until they stop talking, then the clip goes to /api/hear. Returns null
   * when they never started (the caller's ladder takes over).
   */
  const listenForAnswer = async (
    beat: Beat,
    onsetTimeoutMs: number,
    options: { transcribe?: boolean; silenceMs?: number } = {},
  ): Promise<{ transcript: string; number: string | null; confidence: number | null } | null> => {
    const stream = streamRef.current;
    if (!stream || stoppedRef.current) return null;
    const missesSoFar = missesRef.current.get(beat.id) ?? 0;
    const confirmsSoFar = confirmsRef.current.get(beat.id) ?? 0;

    setRuntimeStatus("listening");
    // Parent mute means "don't listen to this child right now": no
    // recording, no transcription — the ladder simply runs its course.
    if (mutedRef.current) {
      await wait(onsetTimeoutMs);
      return null;
    }
    // Tap-to-answer stays available for the whole window.
    if (beat.expectedAnswer) {
      if (beat.answerChoices && beat.answerChoices.length >= 2) {
        setAnswerPad({ kind: "choices", options: beat.answerChoices });
      } else if (/^[\d\s,]+$/.test(beat.expectedAnswer) || parseAnswerPredicate(beat.expectedAnswer)) {
        // A predicate question ("any arrangement of these digits") is
        // answered by tapping digits, exactly like a plain number.
        setAnswerPad({ kind: "number" });
      }
    }

    // The child's turn on the board: the primitive up there is the answer
    // surface, the pointer parks, and a touch answer meets a spoken one in
    // the same judge. An abacus that already shows the answer is read, not
    // rebuilt, so its beads stay put for a reading question.
    const surface = answerSurfaceFor(stageRef.current);
    const expectedDigits = (beat.expectedAnswer ?? "").replace(/\D/g, "");
    const touchable = surface !== null && (surface.surface !== "abacus" || (expectedDigits !== "" && expectedDigits !== surface.shownNumber));
    answerTargetRef.current = surface?.target ?? null;
    // A phrase question after one miss: three tappable findings (the
    // correct one shuffled in), so a child who knows but cannot phrase it
    // is never stuck.
    const rubricChoices = beat.rubric?.choices && missesSoFar >= 1 ? shuffleBy(beat.rubric.choices, beat.id) : undefined;
    setYourTurn({
      kind: beat.type === "SOFT_CHECK" ? "soft" : "ask",
      surface: surface?.surface ?? null,
      touchable,
      choices: rubricChoices ?? (beat.answerChoices && beat.answerChoices.length >= 2 ? beat.answerChoices : undefined),
      // Two doubtful hearings: the pad opens by itself, no third "say it again".
      padFirst: confirmsSoFar >= CONFIRM_LIMIT,
      // A number, a digit set, or a number NAME ("අසූ හතර") — the pad answers all three (see answersMatch).
      numeric: Boolean(
        beat.expectedAnswer &&
          (/^[\d\s,]+$/.test(beat.expectedAnswer) ||
            parseAnswerPredicate(beat.expectedAnswer) ||
            beat.expectedAnswer.trim().split(/\s+/).every((token) => isNumberWord(token))),
      ),
    });
    setStage({ ...stageRef.current, parked: true });

    padAnswerRef.current = null;
    const handle = recordAnswerClip(stream, {
      onsetTimeoutMs,
      silenceMs: options.silenceMs,
      onLevel: (rms) => setMicLevel(mutedRef.current ? 0 : rms),
      onSpeechStart: () => logEvent("child speaking"),
    });
    recorderRef.current = handle;
    const recording = await handle.done;
    recorderRef.current = null;
    setMicLevel(0);
    setAnswerPad(null);
    setYourTurn(null);
    setStage({ ...stageRef.current, parked: false });

    // A tapped answer beats anything the mic heard.
    const tapped = padAnswerRef.current;
    padAnswerRef.current = null;
    if (tapped) {
      logEvent(`answer (tapped) "${tapped}"`);
      // A tap is certain: it never needs a CONFIRM.
      return { transcript: tapped, number: /^\d+$/.test(tapped) ? tapped : null, confidence: 1 };
    }
    if (!recording.spoke || stoppedRef.current) return null;
    // The child made a sound but their words aren't needed (see
    // TRANSCRIBE_SOFT_CHECKS) — answer them now rather than in five
    // seconds' time.
    if (options.transcribe === false) return { transcript: "", number: null, confidence: null };

    setRuntimeStatus("thinking");
    metricsRef.current.flashAudioSeconds += recording.durationMs / 1000;
    try {
      const response = await fetch("/api/hear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: recording.wavBase64, mime_type: "audio/wav" }),
      });
      const heard = await response.json();
      const transcript = typeof heard?.transcript === "string" ? heard.transcript.trim() : "";
      const number = typeof heard?.number === "string" && heard.number ? heard.number : null;
      const confidence = typeof heard?.confidence === "number" ? heard.confidence : null;
      logEvent(`heard "${(number ?? transcript).slice(0, 30)}" (${Math.round(recording.durationMs / 100) / 10}s${confidence !== null ? `, conf ${confidence.toFixed(2)}` : ""})`);
      if (!transcript && !number) return null;
      return { transcript: transcript || (number ?? ""), number, confidence };
    } catch (err) {
      console.error("[useLessonRuntime] /api/hear failed:", err);
      return null;
    }
  };

  // -----------------------------------------------------------------
  // The lesson loop
  // -----------------------------------------------------------------

  const finishBeatLog = async (beat: Beat, decision: PlannerDecision | null) => {
    sequenceRef.current += 1;
    await logBeat({
      sessionId: sessionIdRef.current,
      sequence: sequenceRef.current,
      beat,
      directorText: buildDirectorLine(beat),
      boardState: activeChoreoRef.current ? describeStage(stageRef.current) : boardContentRef.current,
      childTranscript: childTranscriptRef.current.trim() || null,
      plannerDecision: decision,
      outputAudioMs: beatAudioMsRef.current,
      startedAt: beatStartedAtRef.current,
      endedAt: new Date().toISOString(),
    });
  };

  const boardContentRef = useRef<BoardContent | null>(null);

  /**
   * Draws a number on whatever board is up — "board always". A lesson
   * content board gets the read-back overlay beneath the picker; the
   * abacus already has a slot for the child's number; anything else gets
   * a chalk card with the number and its name.
   */
  const showNumberOnBoard = (value: number) => {
    const digits = String(value);
    const name = sinhalaNumberName(value);
    const base = stageRef.current.base;
    if (base?.kind === "digitPicker") dispatchStage({ primitive: "digitPicker", event: "built_number", args: { digits, name, by: "child" } });
    else if (base?.kind === "abacus") dispatchStage({ primitive: "abacus", event: "child_answer_overlay", args: { text: digits } });
    else dispatchStage({ primitive: "chalkText", event: "write", args: { text: `${digits} - ${name}` } });
    const current = boardContentRef.current;
    let next: BoardContent;
    if (current?.type === "lesson_content") next = { ...current, builtNumber: { digits, name } };
    else if (current?.type === "abacus") next = { ...current, childAnswer: digits };
    else next = { type: "text_card", text: `${digits}\n${name}` };
    boardContentRef.current = next;
    setBoardContent(next);
  };

  /**
   * Says a number in the recorded voice by splicing her number-word clips
   * (src/lib/composeNumberAudio.ts), optionally inside a recorded frame
   * ("ඔයා කිව්වේ ___ නේද?"). Returns false — having played NOTHING — when
   * any clip is missing: two voices spliced mid-sentence is worse than
   * silence, and the caller decides what the fallback is.
   */
  const speakComposedNumber = async (value: number, frame?: NumberFrame): Promise<boolean> => {
    const player = playerRef.current;
    const config = audioConfigRef.current;
    if (!player || !config || stoppedRef.current) return false;
    if (!Number.isInteger(value) || value < 0 || value > 100_000) return false;
    const plan = numberClipPlan(value, config.voice);
    const words: string[] = [];
    if (frame?.before) words.push(resolveAddress(frame.before, childGenderRef.current));
    words.push(...plan.words.map((w) => w.word));
    if (frame?.after) words.push(frame.after);
    const clips: Uint8Array[] = [];
    for (const word of words) {
      const clip = await loadClipByKey(clipKey(word, config.voice), word).catch(() => null);
      if (!clip) {
        logEvent(`number clips missing for "${word}" — board only`);
        console.warn(`[useLessonRuntime] no recorded clip for number word "${word}"; not composing ${value}`);
        return false;
      }
      clips.push(new Uint8Array(clip.audio));
    }
    let audio: Uint8Array;
    try {
      audio = concatWavClips(clips);
    } catch (error) {
      console.warn("[useLessonRuntime] could not splice number clips:", error);
      return false;
    }
    const durationMs = Math.round((pcmOfWav(audio).length / CLIP_SAMPLE_RATE) * 1000);
    setCaption(words.join(" "));
    beatAudioMsRef.current += durationMs;
    logEvent(`composed number ${value} (${plan.spoken}) from ${clips.length} clip(s)`);
    await player.playClip(audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer, {
      sentences: [{ startMs: 0, endMs: durationMs }],
    });
    await wait(MIC_TAIL_MS);
    return true;
  };

  /** Board first (it is what she is about to talk about), then bookkeeping. */
  const prepareBeat = async (beat: Beat) => {
    activeBeatRef.current = beat;
    childTranscriptRef.current = "";
    beatAudioMsRef.current = 0;
    beatStartedAtRef.current = new Date().toISOString();
    logEvent(`serve ${beat.type} ${beat.id.slice(0, 40)}`);
    if (beat.conceptTag !== FRAMING_CONCEPT) setCurrentConceptTag(beat.conceptTag);
    if (beat.sessionIndex >= 0) setCurrentSessionIndex(beat.sessionIndex);
    if (beat.type === "SESSION_START" || beat.id.endsWith("lesson-goals-0")) {
      sessionStatsRef.current = { concepts: new Set<string>(), correct: 0, asked: 0 };
    }
    refreshProgress();
    // A storyboarded beat: its board is its events, fired on the clip's
    // sentences (see speak). A repeat (↺) starts from the board as it was
    // before the beat, so the events replay over the audio.
    const storyboarded = storyboardRef.current.get(beat.id) ?? null;
    const repeating = storyboarded !== null && activeChoreoRef.current?.beat.id === beat.id;
    if (repeating) setStage(activeChoreoRef.current!.snapshot);
    const snapshot = repeating ? activeChoreoRef.current!.snapshot : stageRef.current;
    activeChoreoRef.current = storyboarded ? { beat: storyboarded, snapshot, legacy: null, fired: 0 } : null;
    publishChoreo();
    try {
      const action = beatSpec(beat.type).boardAction(beat);
      if (action.kind === "built_number") {
        // The script says "show what they built here"; only the runtime
        // knows what that was. No number yet (she never answered) → the
        // picker simply stays as it is.
        if (lastBuiltNumberRef.current !== null) showNumberOnBoard(lastBuiltNumberRef.current);
        return;
      }
      // Only a content-bank item still needs fetching for a storyboarded
      // beat — the pool or the rows its events draw.
      if (action.kind === "none" || (storyboarded && action.kind !== "stage_item")) return;
      const staged = await stageBeatBoard(action);
      if (staged.board) {
        // An abacus that self-animates over one already on the board keeps
        // the beads on any rod whose digit has not changed — the animation
        // lands the rest. Different number → every rod starts bare.
        const previous = boardContentRef.current;
        if (staged.board.type === "abacus" && staged.board.selfAnimate && previous?.type === "abacus") {
          staged.board = {
            ...staged.board,
            shown: staged.board.digits.map((d, i) => (previous.digits[i] === d ? Math.min(d, previous.shown[i] ?? 0) : 0)),
          };
        }
        boardContentRef.current = staged.board;
        setBoardContent(staged.board);
        const base = stageFromLegacy(staged.board);
        if (storyboarded && activeChoreoRef.current) activeChoreoRef.current.legacy = base;
        else setStage({ ...stageRef.current, base, notes: [], highlight: null, pointer: null, seq: stageRef.current.seq + 1 });
      } else if (staged.viewPatch) {
        const patched = applyViewPatch(boardContentRef.current, staged.viewPatch as ViewPatch);
        boardContentRef.current = patched;
        setBoardContent(patched);
        if (!storyboarded) setStage({ ...stageRef.current, base: stageFromLegacy(patched), seq: stageRef.current.seq + 1 });
      }
    } catch (err) {
      console.error("[useLessonRuntime] Board staging failed for", beat.id, err);
    }
  };

  /**
   * Says one beat: board, then its clip. Nothing else — the caller decides
   * what the child owes afterwards. (A CONFIRM is delivered this way and
   * listened to by the code that raised it, so no window is opened twice.)
   */
  const deliverBeat = async (
    rawBeat: Beat,
    options: { composed?: { value: number; frame: NumberFrame } } = {},
  ): Promise<Beat> => {
    const beat = resolveBeatAddress(rawBeat, childGenderRef.current);
    await prepareBeat(beat);
    setRuntimeStatus("teaching");
    // A CONFIRM or give-up line may be spoken entirely from recorded clips
    // (frame + number + frame). If every clip exists that IS the line;
    // otherwise the ordinary path renders it, and the fallback is logged.
    let spoken = false;
    if (options.composed) {
      spoken = await speakComposedNumber(options.composed.value, options.composed.frame);
      if (!spoken) logEvent(`composed line unavailable for ${options.composed.value} — rendering it instead`);
    }
    if (!spoken) await speak(beat);
    // The read-back: "look at the board" — then the number itself, in her
    // voice, if the number-word clips exist. Never the AI voice for this:
    // the board already carries the name, so silence loses nothing.
    if (beatSpec(beat.type).boardAction(beat).kind === "built_number" && lastBuiltNumberRef.current !== null) {
      await speakComposedNumber(lastBuiltNumberRef.current);
    }

    // ↺ (repeat): say the same beat again, advance nothing.
    while (repeatRequestedRef.current && !stoppedRef.current) {
      repeatRequestedRef.current = false;
      await prepareBeat(beat);
      await speak(beat);
    }
    // ✋ chat, asked for while she was talking: hold the lesson here.
    if (chatRequestedRef.current && !stoppedRef.current) {
      chatRequestedRef.current = false;
      await openChat();
    }
    return beat;
  };

  /** Plays one beat through: speech, and whatever the child owes after it. */
  const runBeat = async (rawBeat: Beat, scripted: boolean): Promise<void> => {
    const beat = await deliverBeat(rawBeat);
    if (stoppedRef.current) return;

    const handling = beatSpec(beat.type).onChildResponse;

    if (beat.type === "SOFT_CHECK") {
      // A soft window: any sound at all earns one authored acknowledgement.
      // The words are transcribed for the log (a child answering a question
      // she only half-asked deserves to be on the record), never judged.
      const heard = await listenForAnswer(beat, SOFT_CHECK_WINDOW_MS, {
        transcribe: TRANSCRIBE_SOFT_CHECKS,
        // The acknowledgement waits for her to finish, not for a clock.
        silenceMs: SOFT_CHECK_SILENCE_MS,
      });
      if (heard) {
        childTranscriptRef.current = heard.transcript || "(the child responded)";
        await finishBeatLog(beat, null);
        advanceIfScripted(scripted, null);
        await runBeat(buildSoftAckBeat(beat), false);
        return;
      }
      await finishBeatLog(beat, null);
      advanceIfScripted(scripted, null);
      return;
    }

    if (beat.type === "HOOK" && beat.expectedAnswer) {
      // A doorway, not a test: a matching answer earns the exact praise
      // line; anything else moves warmly on, uncorrected.
      const heard = await listenForAnswer(beat, ASK_SILENCE_TIMEOUT_MS);
      childTranscriptRef.current = heard?.transcript ?? "";
      const said = heard?.number ?? heard?.transcript ?? "";
      await finishBeatLog(beat, null);
      advanceIfScripted(scripted, null);
      if (said && answersMatch(beat.expectedAnswer, said)) {
        await runBeat(buildHookPraiseBeat(beat), false);
      }
      return;
    }

    if (beat.type === "BREAK_CHAT") {
      // An offer. Only a yes opens the live conversation.
      const heard = await listenForAnswer(beat, ASK_SILENCE_TIMEOUT_MS);
      childTranscriptRef.current = heard?.transcript ?? "";
      await finishBeatLog(beat, null);
      advanceIfScripted(scripted, null);
      if (heard && classifyConfirmation(heard.transcript) === "yes") await openChat();
      return;
    }

    if (handling === "judge") {
      await runQuestion(beat, scripted);
      return;
    }

    // Nothing owed: log it and move the lesson on.
    await finishBeatLog(beat, null);
    advanceIfScripted(scripted, null);
  };

  const advanceIfScripted = (scripted: boolean, decision: PlannerDecision | null) => {
    const script = scriptRef.current;
    if (!scripted || !script) return null;
    const before = stateRef.current;
    const result = advance(script, before, decision);
    stateRef.current = result.state;
    noteAdvance(result, activeBeatRef.current, decision, before);
    return result;
  };

  /**
   * A question the child is expected to answer, with the never-wait-forever
   * ladder: 8s of quiet → she nudges; 12s more → she offers help; 10s more
   * → she demonstrates the answer and the lesson moves on (logged as NOT
   * ATTEMPTED — no mastery credit, but no reteach spiral either).
   */
  const runQuestion = async (beat: Beat, scripted: boolean): Promise<void> => {
    const ladder = [ASK_SILENCE_TIMEOUT_MS, ASK_HELP_TIMEOUT_MS, ASK_GIVEUP_TIMEOUT_MS];
    for (let rung = 0; rung < ladder.length; rung += 1) {
      const heard = await listenForAnswer(beat, ladder[rung]);
      if (stoppedRef.current) return;
      if (heard) {
        await judgeAnswer(beat, scripted, heard);
        return;
      }
      logEvent(`silence ladder rung ${rung + 1}`);
      if (rung === 0) {
        await runBeat(buildWaitBeat(beat), false);
      } else if (rung === 1) {
        await runBeat(buildOfferHelpBeat(beat), false);
      } else {
        // Bottom of the ladder: she shows them, and the lesson goes on.
        childTranscriptRef.current = "";
        await finishBeatLog(beat, { understood: false, next: "advance", reason: "Not attempted (silence ladder)." });
        if (beat.expectedAnswer) void recordMastery(beat, false);
        advanceIfScripted(scripted, null);
        // The demonstration: the answer on the board whatever it is, and
        // in her voice when its number words are recorded.
        await revealAnswer(beat);
      }
      if (stoppedRef.current) return;
    }
  };

  /**
   * The judge, and the ladder after it.
   *
   * Every ASK gets at most three tries: miss 1 → the miss line and a
   * retry; miss 2 → a RETEACH from a different angle and one more try;
   * miss 3 → she states the answer with a one-line explanation (REVEAL)
   * and the lesson moves on, the item logged as not mastered. Never a
   * fourth ask. A CONFIRM echoes only what was heard (src/lib/confirmPolicy),
   * and after two doubtful hearings the pad takes over.
   */
  const judgeAnswer = async (
    beat: Beat,
    scripted: boolean,
    heard: { transcript: string; number: string | null; confidence: number | null },
  ): Promise<void> => {
    const script = scriptRef.current;
    if (!script) return;
    const said = heard.number ?? heard.transcript;
    childTranscriptRef.current = heard.transcript;

    if (!beat.rubric && !looksLikeAnswerAttempt(beat, said)) {
      // A tangent is not a wrong answer: acknowledge it, ask again.
      await finishBeatLog(beat, null);
      await runBeat(
        {
          ...beat,
          id: `${beat.id}:reask`,
          type: "WAIT",
          spokenText: undefined,
          sayCandidates: undefined,
          goal: `The child said something off-topic ("${said.slice(0, 40)}"). Answer it warmly in ONE short sentence, then ask the question again: ${beat.goal}`,
          maxSentences: 2,
          board: { kind: "none" },
          endBy: "pausing",
        },
        false,
      );
      await runBeat(beat, scripted);
      return;
    }

    let decision: PlannerDecision;
    if (beat.rubric) {
      // A PHRASE answer: the rubric's tokens first, one model call only when
      // nothing matched. The stage that decided goes into the log.
      const verdict = await judgePhrase(heard.transcript || said, beat.rubric, judgeWithRubric);
      decision = { understood: verdict.accepted, next: "advance", reason: `stage ${verdict.stage}: ${verdict.why}` };
      logEvent(`phrase judged by stage ${verdict.stage}: ${verdict.accepted ? "accepted" : "not accepted"} — ${verdict.why.slice(0, 40)}`);
    } else {
      // An answer that exactly matches what the item expects needs no
      // interpretation; the planner is for the ambiguous and the wrong.
      const exact = beat.expectedAnswer && answersMatch(beat.expectedAnswer, said);
      decision = exact ? { understood: true, next: "advance", reason: "Exact match with the expected answer." } : await runPlanner(beat, said);

      // A doubtful hearing is read back before it is judged — what was
      // HEARD, never the answer key, and never a third time.
      const echo = confirmValueFor({
        hearing: heard,
        expected: beat.expectedAnswer,
        plannerGuess: decision.ambiguousNumber,
        confirmsSoFar: confirmsRef.current.get(beat.id) ?? 0,
      });
      if (echo && beat.expectedAnswer !== undefined && !exact) {
        confirmsRef.current.set(beat.id, (confirmsRef.current.get(beat.id) ?? 0) + 1);
        const confirmBeat = buildConfirmBeat(beat, echo);
        const heardValue = /^\d+$/.test(echo) ? Number(echo) : NaN;
        if (Number.isInteger(heardValue)) showNumberOnBoard(heardValue);
        await deliverBeat(confirmBeat, Number.isInteger(heardValue) ? { composed: { value: heardValue, frame: NUMBER_FRAMES.heard } } : {});
        const reply = await listenForAnswer(confirmBeat, ASK_SILENCE_TIMEOUT_MS);
        const outcome = resolveConfirmation(beat, echo, reply ? classifyConfirmation(reply.transcript) : "other", answersMatch);
        if (outcome.kind === "judged") {
          decision = outcome.decision;
        } else if (outcome.kind === "reask") {
          await runBeat(beat, scripted);
          return;
        } else if (reply) {
          decision = await runPlanner(beat, reply.number ?? reply.transcript);
        }
      }
    }

    sessionStatsRef.current.asked += 1;
    noteMastery(beat.conceptTag, decision.understood);
    recentAnswersRef.current.push({ question: beat.spokenText ?? beat.goal, answer: said, correct: decision.understood });
    if (recentAnswersRef.current.length > 4) recentAnswersRef.current.shift();
    // Correct → the burst on the answered element and a celebration; wrong
    // → the gentle wobble and an encouraging nod. Never both. The praise
    // or miss clip follows as the FEEDBACK beat.
    fireFeedback(decision.understood ? "correct" : "wrong", answerTargetRef.current);
    setCharacterMood(decision.understood ? "celebrate" : "encourage");
    if (beat.conceptTag !== FRAMING_CONCEPT) sessionStatsRef.current.concepts.add(beat.conceptTag);
    void recordMastery(beat, decision.understood);
    if (stageRef.current.base?.kind === "abacus" && said && !beat.rubric) dispatchStage({ primitive: "abacus", event: "child_answer_overlay", args: { text: said.slice(0, 24) } });

    if (decision.understood) {
      sessionStatsRef.current.correct += 1;
      setCelebrateNonce((n) => n + 1);
      // An open build question: keep the number she made, so the next
      // beat's board and the read-back can show and say it.
      if (parseAnswerPredicate(beat.expectedAnswer)) {
        const digits = said.replace(/\D/g, "");
        if (digits) lastBuiltNumberRef.current = Number(digits);
      }
      await finishBeatLog(beat, decision);
      if (!scripted) {
        await runBeat(buildFeedbackBeat(beat, true, beat.expectedAnswer), false);
        setCharacterMood("none");
        return;
      }
      const before = stateRef.current;
      const result = advance(script, before, decision);
      stateRef.current = result.state;
      await runBeat(buildFeedbackBeat(beat, true, beat.expectedAnswer), false);
      setCharacterMood("none");
      noteAdvance(result, beat, decision, before);
      return;
    }

    // --- the ladder ------------------------------------------------------
    const misses = (missesRef.current.get(beat.id) ?? 0) + 1;
    missesRef.current.set(beat.id, misses);
    logEvent(`miss ${misses} on ${beat.id.slice(0, 40)}`);
    await finishBeatLog(beat, { ...decision, reason: `${decision.reason ?? ""} (miss ${misses} of 3)`.trim() });

    if (misses === 1) {
      await runBeat(buildFeedbackBeat(beat, false, beat.expectedAnswer), false);
      setCharacterMood("none");
      await runQuestion(beat, scripted);
      return;
    }
    if (misses === 2) {
      await runBeat(buildFeedbackBeat(beat, false, beat.expectedAnswer, { reteachFollows: true }), false);
      setCharacterMood("none");
      const { beats: reteachBeats, angleUsed } = buildReteachBeats(script, beat, usedReteachAnglesRef.current);
      if (angleUsed) usedReteachAnglesRef.current.push(angleUsed);
      for (const reteach of reteachBeats) {
        if (stoppedRef.current) return;
        await runBeat(reteach, false);
      }
      await runQuestion(beat, scripted);
      return;
    }

    // Miss 3: she states the answer with a one-line explanation, and the
    // lesson moves on — the item stays logged as not mastered.
    setCharacterMood("none");
    await revealAnswer(beat);
    if (scripted) {
      const before = stateRef.current;
      const result = advance(script, before, { understood: false, next: "advance", reason: "Revealed after three misses." });
      stateRef.current = result.state;
      noteAdvance(result, beat, null, before);
    }
  };

  /** The REVEAL: the answer on the board and in her voice, plus the rubric's one-line explanation when there is one. */
  const revealAnswer = async (beat: Beat): Promise<void> => {
    const answer = (beat.expectedAnswer ?? "").replace(/[\s,]/g, "");
    const answerValue = /^\d+$/.test(answer) ? Number(answer) : NaN;
    if (beat.rubric) {
      const explanation = renderNumberMarkers(beat.rubric.explainSi ?? "").spoken;
      const reveal: Beat = {
        ...beat,
        id: `${beat.id}:reveal`,
        type: "REVEAL_PART",
        goal: "State the finding (verbatim) and move on.",
        spokenText: `කමක් නෑ {address}, බලන්න — ${explanation || beat.expectedAnswer || ""}`.trim(),
        sayCandidates: undefined,
        board: { kind: "none" },
        expectedAnswer: undefined,
        rubric: undefined,
        endBy: "pausing",
      };
      await deliverBeat(reveal);
      await finishBeatLog(reveal, null);
      return;
    }
    const giveUp = buildGiveUpBeat(beat);
    if (Number.isInteger(answerValue) && giveUp.board.kind !== "reveal_part") showNumberOnBoard(answerValue);
    if (Number.isInteger(answerValue)) {
      await deliverBeat(giveUp, { composed: { value: answerValue, frame: NUMBER_FRAMES.answer } });
      await finishBeatLog(giveUp, null);
    } else {
      await runBeat(giveUp, false);
    }
  };

  /** What the ✋ chat is told about where the child is (src/lib/chatContext.ts). */
  const buildChatContext = (): ChatContext => {
    const script = scriptRef.current;
    const beat = activeBeatRef.current;
    const tag = beat?.conceptTag && beat.conceptTag !== FRAMING_CONCEPT ? beat.conceptTag : (currentConceptTag ?? "");
    const summary = script?.concepts.find((c) => c.conceptTag === tag);
    const next = script?.beats[stateRef.current.beatIndex];
    let weakest: string | null = null;
    let weakestRatio = 1;
    for (const [conceptTag, entry] of masteryRef.current) {
      if (entry.asked === 0) continue;
      const ratio = entry.correct / entry.asked;
      if (ratio < weakestRatio) {
        weakestRatio = ratio;
        weakest = conceptTitle(conceptTag, script?.concepts.find((c) => c.conceptTag === conceptTag)?.description);
      }
    }
    return {
      subject,
      lesson: `${lesson} · සංඛ්‍යා - 1`,
      concept: { tag, title: conceptTitle(tag, summary?.description), objective: summary?.description ?? "" },
      recentLines: recentLinesRef.current.slice(-3),
      nextLine: next?.spokenText ?? null,
      board: serializeStage(stageRef.current),
      recentAnswers: recentAnswersRef.current.slice(-2),
      weakestConcept: weakestRatio < 1 ? weakest : null,
    };
  };

  /** Pauses the lesson for a live conversation, and resumes when it ends. */
  const openChat = async () => {
    const stream = streamRef.current;
    const player = playerRef.current;
    if (!stream || !player) return;
    setRuntimeStatus("chatting");
    setStage({ ...stageRef.current, pointer: null, parked: false });
    logEvent("live chat opened");
    await chat.runChat({
      stream,
      player,
      context: buildChatContext(),
      onBoardTool: (name, args) => {
        const target = typeof args.target === "string" ? parseTargetKey(args.target) : null;
        if (!target) return;
        if (name === "point_at") dispatchStage({ primitive: "pointer", event: "move_to", args: { target } });
        else dispatchStage({ primitive: "highlight", event: args.kind === "underline" ? "underline" : "circle", args: { target } });
      },
    });
    logEvent("live chat closed");
    setRuntimeStatus("teaching");
  };

  /** The driver: beats in order, inserted beats first, until the sitting ends. */
  const runLesson = async () => {
    const script = scriptRef.current;
    if (!script) return;
    while (!stoppedRef.current) {
      while (pausedRef.current && !stoppedRef.current) await wait(200);
      if (stoppedRef.current) break;

      if (chatRequestedRef.current) {
        chatRequestedRef.current = false;
        await openChat();
        continue;
      }

      const queued = pendingBeatsRef.current.shift();
      if (queued) {
        await runBeat(queued, false);
        continue;
      }
      if (skipToCloseRef.current) {
        skipToCloseRef.current = false;
        jumpToClose(script);
      }
      if (isLessonComplete(script, stateRef.current)) break;
      const next = beatAt(script, stateRef.current);
      if (!next) break;

      const wasClose = next.type === "CLOSE_SESSION";
      // Warm the next THREE lines while this one plays — playback should
      // never wait on the network between beats, even across a couple of
      // quick short beats.
      for (let ahead = 1; ahead <= 3; ahead += 1) {
        const following = script.beats[stateRef.current.beatIndex + ahead];
        if (!following) break;
        const line = lineFor(following);
        if (line) prefetchClip(resolveAddress(line, childGenderRef.current));
      }

      if (next.type === "RECAP") {
        // The placeholder expands into this child's own review question(s).
        pendingBeatsRef.current.push(...(await fetchRecapBeats({ excludeSessionId: sessionIdRef.current })));
      }
      await runBeat(next, true);
      if (wasClose) break; // one sitting per visit
    }
    if (!stoppedRef.current) {
      await reportMetrics();
      // The sitting is over: let go of the microphone and the audio
      // context, but stay on "done" rather than falling back to idle
      // (which the screen would read as "never started" and restart).
      recorderRef.current?.cancel();
      closeRecordingContext();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setSessionSummary(buildSummary());
      setRuntimeStatus("done");
    }
  };

  const jumpToClose = (script: LessonScript) => {
    const beat = activeBeatRef.current;
    const around = beat && beat.sessionIndex >= 0 ? beat.sessionIndex : currentSessionIndex;
    const session = script.sessions[around] ?? script.sessions[script.sessions.length - 1];
    const closeIndex = script.beats
      .slice(session.firstBeat, session.lastBeat + 1)
      .findIndex((candidate) => candidate.type === "CLOSE_SESSION");
    if (closeIndex === -1) return;
    pendingBeatsRef.current = [];
    stateRef.current = { ...stateRef.current, beatIndex: session.firstBeat + closeIndex };
  };

  const metricsSentRef = useRef(false);
  /** Stable listener identity so it can actually be removed again. */
  const flushMetricsRef = useRef<() => void>(() => undefined);

  /** The audio-cost split, on the session log, every session. */
  const reportMetrics = async (keepalive = false) => {
    if (metricsSentRef.current) return;
    metricsSentRef.current = true;
    const { cachedSeconds, flashAudioSeconds, clipsPlayed, clipsRendered } = metricsRef.current;
    const liveSeconds = chat.liveSecondsRef.current ?? 0;
    logEvent(
      `metrics cached=${Math.round(cachedSeconds)}s flash_audio=${Math.round(flashAudioSeconds)}s live=${liveSeconds}s`,
    );
    await fetch("/api/session-log", {
      method: "POST",
      keepalive,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionIdRef.current,
        sequence: sequenceRef.current + 1,
        beat_id: "session-metrics",
        beat_type: "SESSION_METRICS",
        director_text:
          `cached_seconds=${Math.round(cachedSeconds)} flash_audio_seconds=${Math.round(flashAudioSeconds)} ` +
          `live_seconds=${liveSeconds} clips_played=${clipsPlayed} clips_rendered_on_demand=${clipsRendered}`,
        started_at: new Date().toISOString(),
      }),
    }).catch(() => undefined);
  };

  // -----------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------

  const stop = useCallback(() => {
    stoppedRef.current = true;
    // The same flush the pagehide listener would do — via the ref, so this
    // callback does not have to depend on a function rebuilt every render.
    window.removeEventListener("pagehide", flushMetricsRef.current);
    flushMetricsRef.current();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    closeRecordingContext();
    chat.endChat();
    playerRef.current?.clear();
    playerRef.current?.close();
    playerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    activeBeatRef.current = null;
    setRuntimeStatus("idle");
  }, [chat]);

  /**
   * The session cookie, before anything else. /api/* is deny-by-default
   * (see proxy.ts): without this cookie every call the lesson makes would
   * 401. A device that has never entered the access code lands in the
   * "locked" state and the screen shows the code entry.
   */
  const ensureSession = async (accessCode?: string): Promise<"ok" | "locked" | "error"> => {
    try {
      const response = await fetch("/api/session-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accessCode ? { access_code: accessCode } : {}),
      });
      if (response.ok) return "ok";
      if (response.status === 401) {
        const payload = await response.json().catch(() => ({}));
        if (payload?.error === "wrong_code") setError("කේතය වැරදියි. ආයෙ බලලා ලියන්න.");
        return "locked";
      }
      return "error";
    } catch {
      return "error";
    }
  };

  const start = useCallback(async () => {
    setError(null);
    setRuntimeStatus("preparing");
    const auth = await ensureSession();
    if (auth === "locked") {
      setRuntimeStatus("locked");
      return;
    }
    if (auth === "error") {
      setError("සම්බන්ධ වෙන්න බැරි වුණා. ආයෙ උත්සාහ කරන්න.");
      setRuntimeStatus("error");
      return;
    }
    stoppedRef.current = false;
    pausedRef.current = false;
    pendingBeatsRef.current = [];
    usedReteachAnglesRef.current = [];
    sequenceRef.current = 0;
    metricsRef.current = { cachedSeconds: 0, flashAudioSeconds: 0, clipsPlayed: 0, clipsRendered: 0 };
    sessionStatsRef.current = { concepts: new Set<string>(), correct: 0, asked: 0 };
    sessionIdRef.current = crypto.randomUUID();
    sessionStartedAtRef.current = Date.now();
    choreoLogRef.current = [];
    masteryRef.current = new Map();
    activeChoreoRef.current = null;
    frozenRef.current = [];
    setSessionSummary(null);
    setCharacterMood("none");
    setYourTurn(null);
    setStage(initialStage());
    missesRef.current = new Map();
    confirmsRef.current = new Map();
    recentLinesRef.current = [];
    recentAnswersRef.current = [];
    manualPauseRef.current = false;
    holdsRef.current = new Set();

    try {
      const scriptResponse = await fetch("/api/lesson-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, grade, lesson }),
      });
      const scriptJson = await scriptResponse.json();
      if (!scriptJson?.ok || !scriptJson.found) throw new Error("No lesson is ready to teach yet.");
      const script = scriptJson.script as LessonScript;
      scriptRef.current = script;
      setSessionCount(script.sessions.length);
      setLessonConcepts(conceptsFromScript(script));

      const [audioConfig, child, resume] = await Promise.all([
        fetch("/api/audio-config").then((response) => response.json()),
        fetch("/api/active-child", { method: "POST" }).then((response) => response.json()),
        fetchResumePoint(),
      ]);
      audioConfigRef.current = audioConfig?.ok && audioConfig.voice ? { voice: audioConfig.voice } : null;
      childGenderRef.current = child?.gender === "boy" || child?.gender === "girl" ? child.gender : "unspecified";

      let startIndex = 0;
      if (resume.lastBeatId) {
        const lastIndex = script.beats.findIndex((beat) => beat.id === resume.lastBeatId);
        if (lastIndex !== -1) startIndex = Math.min(lastIndex + 1, script.beats.length);
      }
      stateRef.current = createInitialState(startIndex);

      // Landing mid-concept means it was left unfinished: review it first.
      const landing = script.beats[startIndex];
      if (landing && landing.conceptTag !== FRAMING_CONCEPT) {
        const summary = conceptSummary(script, landing.conceptTag);
        if (summary && startIndex > summary.firstBeat) {
          pendingBeatsRef.current.push(...(await fetchRecapBeats({ conceptTags: [landing.conceptTag] })));
        }
      }

      // A sitting often ends by the child simply closing the tab — flush
      // the audio-cost split then too, or the only sessions ever measured
      // are the ones played to the very end.
      metricsSentRef.current = false;
      flushMetricsRef.current = () => void reportMetrics(true);
      window.addEventListener("pagehide", flushMetricsRef.current);

      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const player = new PcmPlayer({ onPlaybackStateChange: setIsAiTalking });
      await player.resume();
      playerRef.current = player;

      setRuntimeStatus("teaching");
      await runLesson();
    } catch (err) {
      console.error("[useLessonRuntime] Could not start the lesson:", err);
      setError(err instanceof Error ? err.message : "Could not start the lesson.");
      setRuntimeStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, grade, lesson]);

  /** The access-code entry (parent-facing, once per device). */
  const submitAccessCode = useCallback(async (code: string) => {
    setError(null);
    const outcome = await ensureSession(code.trim());
    if (outcome === "ok") {
      setRuntimeStatus("idle"); // the screen's auto-start retry takes it from here
      void start();
    } else if (outcome === "error") {
      setError("සම්බන්ධ වෙන්න බැරි වුණා. ආයෙ උත්සාහ කරන්න.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /** Paused when the parent pressed ⏸ OR any automatic hold is on. */
  const applyPause = useCallback(() => {
    const next = manualPauseRef.current || holdsRef.current.size > 0;
    if (next === pausedRef.current) return;
    pausedRef.current = next;
    setPaused(next);
    if (next) {
      recorderRef.current?.cancel();
      void playerRef.current?.suspend();
    } else {
      void playerRef.current?.resume();
      const frozen = frozenRef.current.splice(0);
      for (const entry of frozen) setTimeout(entry.run, Math.max(0, entry.startMs - positionMs()));
    }
  }, []);

  const togglePause = useCallback(() => {
    manualPauseRef.current = !manualPauseRef.current;
    applyPause();
  }, [applyPause]);

  /**
   * An automatic hold — the phone turned to portrait, the tab went to the
   * background — freezes the lesson exactly like ⏸ and lets go when the
   * reason does; the parent's own ⏸ is separate and stays.
   */
  const holdFor = useCallback((reason: "portrait" | "background", on: boolean) => {
    if (on) holdsRef.current.add(reason);
    else holdsRef.current.delete(reason);
    if (on) showHint(reason === "portrait" ? "දුරකථනය හරවන්න — පාඩම නවත්තලා" : "ආයෙ ආවම අපි දිගටම යමු", 2500);
    applyPause();
  }, [applyPause]);

  /** A tap on the board while she is talking: not an answer, and not ignored either. */
  const noteIdleTouch = useCallback(() => {
    if (statusRef.current === "teaching") showHint("Zara කතා කරනවා — ටිකක් ඉන්න, ඊළඟට ඔයාගේ වාරයයි");
  }, []);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  /** ↺ — say the current beat again. */
  const repeatLastBeat = useCallback(() => {
    repeatRequestedRef.current = true;
    recorderRef.current?.cancel();
    playerRef.current?.clear();
  }, []);

  /** ⏹ — jump to this sitting's goodbye so progress is saved properly. */
  const endSessionNow = useCallback(() => {
    skipToCloseRef.current = true;
    pendingBeatsRef.current = [];
    recorderRef.current?.cancel();
    playerRef.current?.clear();
  }, []);

  /** ✋ — the child asks to talk. Opens at the next safe moment. */
  const requestChat = useCallback(() => {
    if (statusRef.current === "chatting") {
      chat.endChat();
      return;
    }
    chatRequestedRef.current = true;
    recorderRef.current?.finish();
  }, [chat]);

  /** A tapped answer (number pad / choice) — the same path as a spoken one. */
  const submitTypedAnswer = useCallback((text: string) => {
    padAnswerRef.current = text;
    recorderRef.current?.finish();
  }, []);

  const resumeAudioOutput = useCallback(() => {
    if (!pausedRef.current) void playerRef.current?.resume();
  }, []);

  const getOutputAmplitude = useCallback(() => playerRef.current?.getAmplitude() ?? 0, []);

  const getDebugSnapshot = useCallback(
    () => ({
      beatId: activeBeatRef.current?.id ?? "—",
      beatType: activeBeatRef.current?.type ?? "—",
      status: statusRef.current,
      recording: recorderRef.current !== null,
      playing: playerRef.current?.getPlaybackDebug()?.playing ?? false,
      voice: audioConfigRef.current?.voice ?? "?",
      audioVersion: AUDIO_FORMAT_VERSION,
      playback: playerRef.current?.getPlaybackDebug() ?? null,
      metrics: {
        cachedSeconds: Math.round(metricsRef.current.cachedSeconds),
        flashAudioSeconds: Math.round(metricsRef.current.flashAudioSeconds),
        liveSeconds: chat.liveSecondsRef.current ?? 0,
        clipsRendered: metricsRef.current.clipsRendered,
      },
      events: debugEventsRef.current.slice(-5),
      stage: describeStage(stageRef.current),
      choreo: activeChoreoRef.current ? `${activeChoreoRef.current.fired}/${activeChoreoRef.current.beat.sentences.length}` : "—",
    }),
    [chat],
  );

  return {
    status,
    error,
    caption,
    boardContent,
    isAiTalking,
    answerPad,
    micLevel,
    lessonConcepts,
    currentConceptTag,
    currentSessionIndex,
    sessionCount,
    celebrateNonce,
    stage,
    yourTurn,
    characterMood,
    conceptStops,
    sessionSummary,
    noClipCaption,
    hint,
    holdFor,
    noteIdleTouch,
    muted,
    paused,
    chatting: chat.chatting,
    start,
    stop,
    togglePause,
    toggleMute,
    repeatLastBeat,
    endSessionNow,
    requestChat,
    submitTypedAnswer,
    resumeAudioOutput,
    getOutputAmplitude,
    getDebugSnapshot,
    submitAccessCode,
  };
}

/** The choices in a fixed order per beat — the correct finding is not always first. */
function shuffleBy(items: string[], seed: string): string[] {
  const out = [...items];
  let hash = [...seed].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  for (let i = out.length - 1; i > 0; i -= 1) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const j = hash % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
