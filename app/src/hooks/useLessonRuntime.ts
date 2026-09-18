"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { arrayBufferToBase64, PcmPlayer } from "@/lib/pcmAudio";
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
import { judgePhrase, judgePhraseLocally } from "@/lib/phraseJudge";
import { renderNumberMarkers } from "@/lib/sinhalaNumber";
import { parseTargetKey } from "@/lib/choreography";
import { valueOfAnswer } from "@/lib/answerMode";
import type { TurnSurface } from "@/components/board/events";
import { boardFocus, serializeStage, type ChatAnswer, type ChatContext } from "@/lib/chatContext";
import type { Target } from "@/components/board/events";
import type { YourTurn } from "@/components/board/BoardStage";
import type { ConceptStop } from "@/components/ProgressStrip";

/** What the sitting did, from the mastery log — the summary route (/session/summary) draws it from session_log; this is the runtime's own tally. */
export interface SessionSummary {
  concepts: Array<{ tag: string; title: string; asked: number; correct: number; mastered: boolean }>;
  asked: number;
  correct: number;
  minutes: number;
}
import {
  advance,
  beatSpec,
  buildConfirmBeat,
  buildFeedbackBeat,
  buildGiveUpBeat,
  buildNudgeBeat,
  buildReteachBeats,
  buildDirectorLine,
  conceptSummary,
  createInitialState,
  currentBeat as beatAt,
  isLessonComplete,
  resolveConfirmation,
  ASK_SILENCE_TIMEOUT_MS,
  TOUCH_NUDGE_MS,
  TOUCH_GIVEUP_MS,
  READ_ALOUD_PAUSE_MS,
  SOFT_CHECK_PAUSE_MS,
  UNAIDED_CORRECT_TO_ADVANCE,
  FRAMING_CONCEPT,
  type AdvanceResult,
  type Beat,
  type CloseReason,
  type LessonScript,
  type OrchestratorState,
  type PlannerDecision,
} from "@/lib/lessonOrchestrator";
import { exerciseUnits, unitAt } from "@/lib/exerciseUnits";
import { estimateBeatSeconds } from "@/lib/beatRegistry";
import { sentencesOf } from "@/lib/scriptDistance";
import { answersMatch, exampleAnswerFor } from "@/lib/answerCheck";
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

export interface ChildRuntimeSettings {
  captions: boolean;
  sound: boolean;
  dailyLimitMinutes: number;
  minutesToday: number;
  /** DEV_MODE=on on the server: the debug overlay may reset this child. */
  devMode: boolean;
}

export type RuntimeStatus =
  | "idle"
  | "locked"
  | "preparing"
  | "teaching"
  /** The child's turn: a touch surface is open (nothing is recorded). */
  | "turn"
  /** A short pause with nothing to answer: reading practice, a soft check. */
  | "pausing"
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
  const sessionIndexRef = useRef(0);
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
  /** The first ✋: the board dims and Zara explains why she listens (the design's P1); the browser's prompt follows only after "හරි". */
  const [micAsk, setMicAsk] = useState(false);
  const micAskRef = useRef<((granted: boolean) => void) | null>(null);
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
  /** Resolves the open touch window the moment the child taps. */
  const tapResolveRef = useRef<(() => void) | null>(null);
  /**
   * VOICE_ASSESSMENT (server env, read from /api/audio-config): the opt-in
   * reading assessment records and transcribes the readAloud pause. Off —
   * the default — nothing on the lesson path touches the microphone,
   * /api/hear, CONFIRM or the rubric model: only the ✋ chat opens the mic.
   */
  const voiceAssessmentRef = useRef(false);
  /** How many times the ✋ chat opened the microphone this sitting (the cost log). */
  const micOpensRef = useRef(0);
  /**
   * The number the child last built on the digit picker (judged correct by
   * a permutation predicate). A "builtNumber" board draws it; the composed
   * number clips speak it. Nothing else knows it — the script cannot.
   */
  const lastBuiltNumberRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const pausedRef = useRef(false);
  /**
   * The lesson's own clock: wall time minus every paused stretch. Every timer
   * that paces the lesson — the inactivity ladder, the reading pause, the
   * tails after a clip — runs on it, so ⏸ freezes all of them at once and
   * nothing that would have fired during a pause fires on resume
   * (docs/qa/session1-triage.md, cluster B: "pausing a few times makes the
   * session jump to the end").
   */
  const pausedAtRef = useRef<number | null>(null);
  const pausedTotalRef = useRef(0);
  const lessonNow = () => Date.now() - pausedTotalRef.current - (pausedAtRef.current === null ? 0 : Date.now() - pausedAtRef.current);
  /** `ms` of UNPAUSED time; a pause mid-wait just lengthens it. */
  const lessonWait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const end = lessonNow() + ms;
      const tick = () => {
        if (stoppedRef.current || interruptRef.current) return resolve();
        const left = end - lessonNow();
        if (left <= 0 && !pausedRef.current) return resolve();
        setTimeout(tick, Math.min(Math.max(left, 40), 250));
      };
      tick();
    });
  /**
   * The inactivity ladder counts from the child's LAST interaction, not from
   * when the window opened: any tap, drag, key or chip press on the lesson
   * screen resets it (noteActivity), and a surface with input in it — digits
   * on the pad, tiles placed, a word picked — never times out at all
   * (noteInput). Cluster B, issues 16 and 17.
   */
  const lastActivityRef = useRef(0);
  const hasInputRef = useRef(false);
  const noteActivity = useCallback(() => {
    lastActivityRef.current = lessonNow();
  }, []);
  const noteInput = useCallback((hasInput: boolean) => {
    hasInputRef.current = hasInput;
    if (hasInput) lastActivityRef.current = lessonNow();
  }, []);
  const mutedRef = useRef(false);
  const chatRequestedRef = useRef(false);
  /** ✋ tapped: every wait on the lesson path ends now, so the sheet opens on ONE tap rather than at the next beat boundary. */
  const interruptRef = useRef(false);
  const skipToCloseRef = useRef(false);
  /**
   * What /api/session-start says about this child: captions (default on),
   * sound, the parent's daily limit and how much of today is already used.
   * The limit is enforced here: when the sitting's clock crosses it the
   * runtime jumps to the sitting's close, exactly as ⏹ does.
   */
  const settingsRef = useRef<ChildRuntimeSettings>({ captions: true, sound: true, dailyLimitMinutes: 30, minutesToday: 0, devMode: false });
  const [childSettings, setChildSettings] = useState<ChildRuntimeSettings | null>(null);
  const limitEndedRef = useRef(false);
  const [limitEnded, setLimitEnded] = useState(false);
  /**
   * Why this sitting ended. "complete" until something says otherwise: the
   * daily limit, the child leaving (⏹), or a failure. It reaches the close
   * card (in her words) and the session_log row, so "why did it stop?" is
   * answerable from the trace instead of guessed at (the device walk).
   */
  const closeReasonRef = useRef<CloseReason>("complete");
  /** The limit has been reached but the child is mid-exercise: the close waits for the exercise to finish. */
  const limitPendingRef = useRef(false);
  const minutesThisSitting = () => (Date.now() - sessionStartedAtRef.current) / 60000;
  const minutesUsedToday = () => settingsRef.current.minutesToday + minutesThisSitting();
  /** DEV_MODE turns the limit OFF by default (a harness or a demo must not be cut short); the debug overlay puts it back. */
  const devLimitOverrideRef = useRef<number | null>(null);
  const [devLimit, setDevLimit] = useState<number | null>(null);
  const effectiveDailyLimit = () => devLimitOverrideRef.current ?? (settingsRef.current.devMode ? Infinity : settingsRef.current.dailyLimitMinutes);
  const dailyLimitReached = () => minutesUsedToday() >= effectiveDailyLimit();
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
    // For the harness: tap-to-feedback latency, on the page's own clock.
    (window as unknown as { __lastFeedbackAt?: number }).__lastFeedbackAt = performance.now();
  };

  /**
   * One sentence's storyboard events, applied to the board — or, while
   * the lesson is paused, held until the audio reaches that sentence.
   * Every firing is logged against the sentence's span so a run can be
   * checked for events that landed outside their clip.
   */
  const fireSentence = (choreo: ActiveChoreo, index: number, spans: AlignedSpans, clipMs: number) => {
    const span = spans.list[index] ?? { startMs: 0, endMs: clipMs };
    const fireOne = (event: ActiveChoreo["beat"]["events"][number]) => {
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
    };
    const mine = choreo.beat.events.filter((e) => e.sentenceIndex === index);
    // Cluster E: an event placed inside the sentence (`at`, 0–1 by the word
    // it answers to) waits for the audio to reach that word; the rest fire
    // as the sentence starts. Same-sentence events never fire together.
    const immediate = mine.filter((e) => !(typeof e.at === "number" && e.at > 0));
    const deferred = mine.filter((e) => typeof e.at === "number" && e.at > 0).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    const run = () => {
      for (const event of immediate) fireOne(event);
      choreo.fired = Math.max(choreo.fired, index + 1);
      publishChoreo();
    };
    if (pausedRef.current) frozenRef.current.push({ run, startMs: span.startMs });
    else run();
    for (const event of deferred) {
      const targetMs = span.startMs + (event.at ?? 0) * Math.max(0, span.endMs - span.startMs);
      atClipPosition(choreo, targetMs, () => {
        fireOne(event);
        publishChoreo();
      });
    }
  };

  /**
   * Runs `fn` when the clip's audio clock reaches `targetMs` — the clock a
   * pause suspends, so a pause holds the event with the word it belongs to
   * and nothing queued fires while paused. Dropped when the beat has moved on.
   */
  const atClipPosition = (choreo: ActiveChoreo, targetMs: number, fn: () => void) => {
    const tick = () => {
      if (stoppedRef.current || activeChoreoRef.current?.beat.id !== choreo.beat.id) return;
      if (pausedRef.current) {
        setTimeout(tick, 120);
        return;
      }
      if (positionMs() >= targetMs) fn();
      else setTimeout(tick, Math.min(120, Math.max(30, targetMs - positionMs())));
    };
    tick();
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
  // A clip fetch that hangs (a signed storage URL that never answers) must
  // become a failure, not a frozen lesson: the missing-clip path then reads
  // the line on the board and runs its events on estimated spans.
  const CLIP_META_TIMEOUT_MS = 10_000;
  /** The render route (a cache miss) — it renders and uploads, so it gets longer than a cached clip, but never forever. */
const SPEAK_LINE_TIMEOUT_MS = 20_000;
const CLIP_AUDIO_TIMEOUT_MS = 25_000;
  const loadClipByKey = async (key: string, text: string): Promise<{ text: string; audio: ArrayBuffer; meta: ClipMeta } | null> => {
    const metaResponse = await fetch(`/api/clip/${key}?meta=1`, { signal: AbortSignal.timeout(CLIP_META_TIMEOUT_MS) });
    if (!metaResponse.ok) return null;
    const meta = (await metaResponse.json()) as ClipMeta;
    const audioResponse = await fetch(`/api/clip/${key}`, { signal: AbortSignal.timeout(CLIP_AUDIO_TIMEOUT_MS) });
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
        // Bounded like the clip fetches: a network that drops mid-lesson (a half-open connection never errors on its own)
        // must fall through to the read-on-the-board path, never hang the beat.
        const response = await fetch("/api/speak-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(SPEAK_LINE_TIMEOUT_MS),
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
  /**
   * THE audio gate. Every path that starts a clip goes through here, so two
   * clips can never be audible at once: acquiring stops and clears whatever
   * is playing or queued, then waits for the previous holder to unwind. The
   * newest request wins — a restart or a resume silences the line that was
   * playing — and nothing stacks (the ↺ pile-up of the device walk).
   */
  const speechLockRef = useRef<Promise<void>>(Promise.resolve());
  const withSpeech = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const previous = speechLockRef.current;
    let release: () => void = () => undefined;
    speechLockRef.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    playerRef.current?.clear();
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const speak = (beat: Beat): Promise<void> => withSpeech(() => speakNow(beat));
  const speakNow = async (beat: Beat): Promise<void> => {
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
        // Later sentences on the audio clock (which a pause suspends), not wall time.
        for (let index = 1; index < spans.list.length; index += 1) {
          const startMs = spans.list[index]!.startMs;
          atClipPosition(silent, startMs, () => fireSentence(silent, index, spans, durationMs));
        }
        await lessonWait(durationMs + MIC_TAIL_MS);
        setNoClipCaption(null);
      } else if (text) {
        // A beat with words but no storyboard (the session's close, a recap):
        // the words are read ON THE BOARD for as long as saying them would
        // have taken. Skipping it outright made the close card flash past in
        // milliseconds — the sitting looked like it ended for no reason.
        const spans = alignSpans(null, sentencesOf(text));
        const durationMs = spans.list[spans.list.length - 1]?.endMs ?? 0;
        logEvent(`no clip for ${beat.id.slice(0, 40)} (${beat.type}) — read on the board for ${durationMs}ms`);
        setCaption(text);
        setNoClipCaption(text);
        recentLinesRef.current.push(text);
        await lessonWait(durationMs + MIC_TAIL_MS);
        setNoClipCaption(null);
      } else {
        // Nothing to say and nothing to show (a RETEACH the runtime wrote no
        // line for): the trace says so, and what follows carries on.
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
    await lessonWait(MIC_TAIL_MS);
  };

  // -----------------------------------------------------------------
  // Hearing: one recording, one request
  // -----------------------------------------------------------------

  /**
   * The child's turn opens on the board: the surface that leads, the chips,
   * the pad fallback, the pointer parked. Nothing is recorded here.
   */
  const openTurn = (beat: Beat) => {
    const missesSoFar = missesRef.current.get(beat.id) ?? 0;
    const confirmsSoFar = confirmsRef.current.get(beat.id) ?? 0;
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
    const soft = beat.type === "SOFT_CHECK";
    const mode = beat.answerMode ?? null;
    // valueOrPlace with the abacus up: a tap on a rod answers with what the
    // rod shows — its bead count when the question counts beads, else its
    // digit's value at its place.
    const rodPick: "count" | "value" | undefined =
      !soft && mode === "valueOrPlace" && surface?.surface === "abacus"
        ? (valueOfAnswer(beat.expectedAnswer) ?? 10) < 10 && /පබළු/u.test(beat.spokenText ?? "")
          ? "count"
          : "value"
        : undefined;
    const touchable = surface !== null && (surface.surface !== "abacus" || rodPick !== undefined || (expectedDigits !== "" && expectedDigits !== surface.shownNumber));
    answerTargetRef.current = surface?.target ?? null;
    // The chips: from the start for the chip-primary modes (why, readAloud
    // beneath the 🎤 cue, valueOrPlace beside the rods); for a build or a
    // cell only after a miss, or once the hearing has been doubtful twice.
    // Never on a soft check.
    const chipsFromStart = mode === "why" || mode === "readAloud" || mode === "valueOrPlace";
    const legacyChoices = beat.answerChoices && beat.answerChoices.length >= 2 && beat.expectedAnswer ? { options: beat.answerChoices, correctIndex: beat.answerChoices.indexOf(beat.expectedAnswer) } : undefined;
    const chips = !soft && (chipsFromStart || missesSoFar >= 1 || confirmsSoFar >= CONFIRM_LIMIT) ? (beat.choices ?? legacyChoices) : undefined;
    const turnSurface: TurnSurface = rodPick
        ? "rod"
        : surface?.surface === "digitPicker" && touchable
          ? "picker"
          : surface?.surface === "abacus" && touchable
            ? "beads"
            : surface?.surface === "blankTable" || surface?.surface === "expansion"
              ? "cell"
              : chips
                ? "chips"
                : "pad";
    dispatchStage({ primitive: "turn", event: "your_turn", args: { answerMode: mode ?? "build", surface: turnSurface } });
    if (chips) dispatchStage({ primitive: "choiceChips", event: "show", args: { options: chips.options, correctIndex: chips.correctIndex } });
    else if (stageRef.current.chips) dispatchStage({ primitive: "choiceChips", event: "clear", args: {} });
    setYourTurn({
      kind: soft ? "soft" : "ask",
      surface: surface?.surface ?? null,
      touchable,
      answerMode: mode ?? undefined,
      chips,
      rodPick,
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
  };

  const closeTurn = () => {
    hasInputRef.current = false;
    setAnswerPad(null);
    setYourTurn(null);
    setStage({ ...reduceStage(stageRef.current, { primitive: "turn", event: "over", args: {} }), parked: false });
  };

  /** Resolves with the tapped answer, or null when the window runs out. The mailbox is padAnswerRef. */
  /**
   * The answer window: resolves with the committed answer, or with null once
   * `ms` of unpaused time has passed since the child last did anything —
   * and never while the surface holds input. Polled on the lesson clock
   * (≤ 500 ms granularity is plenty for a 12 s / 25 s ladder).
   */
  const awaitTap = (ms: number): Promise<string | null> =>
    new Promise((resolve) => {
      if (padAnswerRef.current) {
        resolve(padAnswerRef.current);
        return;
      }
      const openedAt = lessonNow();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const arm = () => {
        if (stoppedRef.current) {
          tapResolveRef.current = null;
          resolve(padAnswerRef.current);
          return;
        }
        if (pausedRef.current || hasInputRef.current) {
          timer = setTimeout(arm, 250);
          return;
        }
        const since = Math.max(openedAt, lastActivityRef.current);
        const left = since + ms - lessonNow();
        if (left <= 0) {
          tapResolveRef.current = null;
          resolve(padAnswerRef.current);
          return;
        }
        timer = setTimeout(arm, Math.min(left, 500));
      };
      arm();
      tapResolveRef.current = () => {
        if (timer) clearTimeout(timer);
        tapResolveRef.current = null;
        resolve(padAnswerRef.current);
      };
    });

  /**
   * A recorded authored line (the nudge, the mic explanation, the read-back
   * frame) — played from its clip when the actor has recorded it, else read
   * on the board for a moment. Never rendered on demand: these are the
   * lines docs/RECORDING.md lists for the next session.
   */
  const sayAuthored = async (text: string): Promise<boolean> => {
    const config = audioConfigRef.current;
    const player = playerRef.current;
    if (!config || !player || stoppedRef.current) return false;
    const clip = await loadClipByKey(clipKey(text, config.voice), text).catch(() => null);
    setCaption(text);
    recentLinesRef.current.push(text);
    if (clip) {
      beatAudioMsRef.current += clip.meta.durationMs;
      await player.playClip(clip.audio, { sentences: clip.meta.sentences });
      await lessonWait(MIC_TAIL_MS);
      return true;
    }
    logEvent(`no clip yet for "${text.slice(0, 24)}…" — shown on the board`);
    setNoClipCaption(text);
    await lessonWait(1800);
    setNoClipCaption(null);
    return false;
  };

  /**
   * The answer window, touch only: the surface is open until a tap. No tap
   * for 12 s → one gentle recorded nudge, the surface still open; at 25 s
   * → null, and the caller demonstrates and moves on.
   */
  const answerByTouch = async (beat: Beat): Promise<string | null> => {
    if (stoppedRef.current) return null;
    padAnswerRef.current = null;
    setRuntimeStatus("turn");
    openTurn(beat);
    let tapped = await awaitTap(TOUCH_NUDGE_MS);
    if (!tapped && !stoppedRef.current) {
      logEvent("no tap for 12s — one nudge");
      const nudge = buildNudgeBeat(beat);
      // The nudge's own length (its clip, or the 1.8 s it is shown for) comes off the 25 s.
      const audioBefore = beatAudioMsRef.current;
      const played = await sayAuthored(resolveAddress(nudge.spokenText ?? AUTHORED_LINES.touchNudge, childGenderRef.current));
      const nudgeMs = played ? beatAudioMsRef.current - audioBefore + MIC_TAIL_MS : 1800;
      await finishBeatLog(nudge, null);
      tapped = padAnswerRef.current ?? (await awaitTap(Math.max(0, TOUCH_GIVEUP_MS - TOUCH_NUDGE_MS - nudgeMs)));
    }
    closeTurn();
    padAnswerRef.current = null;
    if (tapped) logEvent(`answer (tapped) "${tapped}"`);
    return tapped;
  };

  /**
   * The read-back: after the child's chip was judged right, Zara reads the
   * number herself (the recorded frame "මම කියන්නම් —" and the composed
   * number), confirming it. Its text reaches the caption only as it plays,
   * and the board does not change — the row she is reading stays as it was.
   * (17 Sep, the device walk: the 3 s "🎤 කියන්න බලන්න" invitation that used
   * to come first is gone — the chips are the question, from the first word.)
   */
  const readBackNumber = async (beat: Beat): Promise<void> => {
    const value = valueOfAnswer(beat.expectedAnswer);
    if (value === null || stoppedRef.current) return;
    dispatchStage({ primitive: "turn", event: "read_back", args: { number: value } });
    const readBack: Beat = {
      ...beat,
      id: `${beat.id}:readback`,
      type: "EXPLAIN",
      goal: "Reading practice: she reads the number herself (verbatim frame + composed number), confirming the answer.",
      spokenText: `${AUTHORED_LINES.readBack} ${sinhalaNumberName(value)}`,
      sayCandidates: undefined,
      board: { kind: "none" },
      expectedAnswer: undefined,
      rubric: undefined,
      choices: undefined,
      endBy: "pausing",
    };
    activeBeatRef.current = readBack;
    const spoken = await speakComposedNumber(value, NUMBER_FRAMES.readBack);
    if (!spoken) {
      // The frame is not recorded yet: the line is read on the board, not rendered.
      logEvent("read-back clips not recorded yet — shown on the board");
      setCaption(readBack.spokenText!);
      setNoClipCaption(readBack.spokenText!);
      await lessonWait(2000);
      setNoClipCaption(null);
    }
    await finishBeatLog(readBack, null);
    activeBeatRef.current = beat;
  };

  /**
   * VOICE ASSESSMENT ONLY (flag off by default): opens the microphone and
   * waits for speech, then the clip goes to /api/hear. Kept so an opt-in
   * reading assessment can be enabled without a rebuild; nothing on the
   * lesson path reaches it while the flag is off.
   */
  const listenForAnswerVoice = async (
    beat: Beat,
    onsetTimeoutMs: number,
    options: { transcribe?: boolean; silenceMs?: number } = {},
  ): Promise<{ transcript: string; number: string | null; confidence: number | null; tapped?: boolean } | null> => {
    if (!voiceAssessmentRef.current) return null;
    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        logEvent("reading assessment: microphone refused");
        return null;
      }
    }
    const stream = streamRef.current;
    if (!stream || stoppedRef.current) return null;
    setRuntimeStatus("turn");
    // Parent mute means "don't listen to this child right now".
    if (mutedRef.current) {
      await wait(onsetTimeoutMs);
      return null;
    }
    openTurn(beat);
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
    closeTurn();

    // A tapped answer beats anything the mic heard.
    const tapped = padAnswerRef.current;
    padAnswerRef.current = null;
    if (tapped) {
      logEvent(`answer (tapped) "${tapped}"`);
      // A tap is certain: it never needs a CONFIRM.
      return { transcript: tapped, number: /^\d+$/.test(tapped) ? tapped : null, confidence: 1, tapped: true };
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
      closeReason:
        beat.type === "CLOSE_SESSION"
          ? { reason: closeReasonRef.current, minutesToday: Math.round(minutesUsedToday()), minutesThisSitting: Math.round(minutesThisSitting()) }
          : null,
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
  const speakComposedNumber = (value: number, frame?: NumberFrame): Promise<boolean> => withSpeech(() => speakComposedNumberNow(value, frame));
  const speakComposedNumberNow = async (value: number, frame?: NumberFrame): Promise<boolean> => {
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
    await lessonWait(MIC_TAIL_MS);
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
      sessionIndexRef.current = beat.sessionIndex;
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
        // A beat outside the storyboard (a framing beat: the close, a recap) starts from a clean turn — no chips, no
        // pause, no read-aloud step cards left over from the question before it.
        else setStage({ ...stageRef.current, base, notes: [], highlight: null, pointer: null, turn: null, chips: null, pause: null, retry: false, seq: stageRef.current.seq + 1 });
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

    // ✋ chat, asked for while she was talking: hold the lesson here.
    if (chatRequestedRef.current && !stoppedRef.current) {
      chatRequestedRef.current = false;
      await openChat();
    }
    return beat;
  };

  /** Plays one beat through: speech, and whatever the child owes after it. */
  /**
   * The close, in her words. A sitting the daily limit ended says so — "අද
   * කාලය ඉවරයි — හෙට ආයෙත් එන්න" with the minutes used on the card — instead
   * of the ordinary goodbye, which would leave the child (and the parent)
   * guessing why it stopped mid-exercise.
   */
  const closeBeatFor = (beat: Beat): Beat => {
    if (beat.type !== "CLOSE_SESSION" || closeReasonRef.current !== "daily_limit") return beat;
    const minutes = Math.max(1, Math.round(minutesUsedToday()));
    const card = beat.board.kind === "text_card" ? beat.board.text.split("\n")[0] ?? "" : "";
    return {
      ...beat,
      spokenText: AUTHORED_LINES.closeSessionDailyLimit,
      board: { kind: "text_card", text: `${AUTHORED_LINES.closeSessionDailyLimit}\nඅද විනාඩි ${minutes}ක්${card ? `\n${card}` : ""}` },
    };
  };

  const runBeat = async (rawBeat: Beat, scripted: boolean): Promise<void> => {
    const beat = await deliverBeat(closeBeatFor(rawBeat));
    if (stoppedRef.current) return;

    const handling = beatSpec(beat.type).onChildResponse;

    if (beat.type === "SOFT_CHECK" || (beat.type === "HOOK" && beat.expectedAnswer) || beat.type === "BREAK_CHAT") {
      // A brief pause while she reacts: no microphone, no acknowledgement
      // clip. Any tap counts as engagement and is on the record; the
      // lesson flows on either way. (A hook's doorway question and the
      // break-time chat offer are the same pause — the ✋ opens a chat.)
      const engaged = await softPause(beat.type === "SOFT_CHECK" ? SOFT_CHECK_PAUSE_MS : READ_ALOUD_PAUSE_MS);
      childTranscriptRef.current = engaged ? "(the child tapped)" : "";
      await finishBeatLog(beat, null);
      advanceIfScripted(scripted, null);
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

  /**
   * A wrong state's visible way back: the "ආයෙත් උත්සාහ කරන්න" paper
   * button, top-right. The surface reopens on its tap — or on its own after
   * 12 s, so a child who just waits is never stuck.
   */
  const awaitRetry = async (): Promise<void> => {
    if (stoppedRef.current) return;
    padAnswerRef.current = null;
    setRuntimeStatus("turn");
    dispatchStage({ primitive: "turn", event: "retry", args: {} });
    const tapped = await awaitTap(TOUCH_NUDGE_MS);
    logEvent(tapped ? "retry: the child tapped ආයෙත් උත්සාහ කරන්න" : "retry: reopened on its own after 12s");
    padAnswerRef.current = null;
    setStage({ ...reduceStage(stageRef.current, { primitive: "turn", event: "over", args: {} }) });
  };

  /** A pause with nothing to answer: the portrait perks up; a tap is engagement. Returns whether the child tapped. */
  const softPause = async (ms: number): Promise<boolean> => {
    if (stoppedRef.current) return false;
    padAnswerRef.current = null;
    setRuntimeStatus("pausing");
    dispatchStage({ primitive: "turn", event: "pause", args: { ms } });
    setYourTurn({ kind: "soft", surface: null, touchable: false, numeric: false });
    const tapped = await awaitTap(ms);
    setYourTurn(null);
    dispatchStage({ primitive: "turn", event: "over", args: {} });
    padAnswerRef.current = null;
    setRuntimeStatus("teaching");
    if (tapped) logEvent("soft check: the child tapped");
    return Boolean(tapped);
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
   * A question the child answers by touch. readAloud opens with the
   * unjudged reading practice (not on a retry); then the surface is open
   * until a tap — a nudge at 12 s, and at 25 s she demonstrates the answer
   * and the lesson moves on (logged NOT ATTEMPTED — no mastery credit, no
   * reteach spiral).
   */
  const runQuestion = async (beat: Beat, scripted: boolean, options: { retry?: boolean } = {}): Promise<void> => {
    if (stoppedRef.current) return;
    const tapped = await answerByTouch(beat);
    if (stoppedRef.current) return;
    if (tapped) {
      await judgeTouch(beat, scripted, tapped);
      return;
    }
    logEvent("no tap by 25s — she demonstrates and moves on");
    childTranscriptRef.current = "";
    await finishBeatLog(beat, { understood: false, next: "advance", reason: "Not attempted (no tap in 25s)." });
    if (beat.expectedAnswer) void recordMastery(beat, false);
    advanceIfScripted(scripted, null);
    await revealAnswer(beat);
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
  /**
   * A tapped answer, judged on the spot with no network: the chip or tile
   * either matches the expected answer (answersMatch: digits, a name, a
   * digit set) or is one of the rubric's findings (judgePhraseLocally).
   * Feedback fires before anything else — the burst lands within the tap.
   */
  const judgeTouch = async (beat: Beat, scripted: boolean, tapped: string): Promise<void> => {
    childTranscriptRef.current = tapped;
    const understood = beat.rubric ? judgePhraseLocally(tapped, beat.rubric).accepted : Boolean(beat.expectedAnswer && answersMatch(beat.expectedAnswer, tapped));
    fireFeedback(understood ? "correct" : "wrong", answerTargetRef.current);
    setCharacterMood(understood ? "celebrate" : "encourage");
    // Reading practice: a right chip earns her reading of the number back — the
    // confirmation. A wrong one gets the ladder as usual; reading the name out
    // then would hand the retry its answer.
    if (understood && beat.answerMode === "readAloud") await readBackNumber(beat);
    // ⏸ during the read-back holds here too: the feedback beat is not served until the child resumes.
    while (pausedRef.current && !stoppedRef.current) await wait(200);
    const decision: PlannerDecision = { understood, next: "advance", reason: understood ? "touch: matches the expected answer" : "touch: does not match the expected answer" };
    await settleAnswer(beat, scripted, tapped, decision, { feedbackFired: true });
  };

  /**
   * VOICE ASSESSMENT ONLY: a hearing judged the old way — tangent check,
   * exact match or planner, CONFIRM for a doubtful hearing, the rubric's
   * model stage for a phrase. Unreachable while the flag is off.
   */
  const judgeSpokenAnswer = async (
    beat: Beat,
    scripted: boolean,
    heard: { transcript: string; number: string | null; confidence: number | null; tapped?: boolean },
  ): Promise<void> => {
    const script = scriptRef.current;
    if (!script || !voiceAssessmentRef.current) return;
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
      // A tapped answer is never read back: only a hearing can be doubtful.
      const echo = heard.tapped
        ? null
        : confirmValueFor({
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
        const reply = await listenForAnswerVoice(confirmBeat, ASK_SILENCE_TIMEOUT_MS);
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

    await settleAnswer(beat, scripted, said, decision);
  };

  /**
   * After a decision, spoken or tapped: the stats, mastery, the feedback
   * beat, and the ladder. Miss 1 → the miss line and a retry (chips now on
   * the surface); miss 2 → a RETEACH from a different angle and one more
   * try; miss 3 → she states the answer (REVEAL) and the lesson moves on,
   * the item logged as not mastered. Never a fourth ask.
   */
  const settleAnswer = async (beat: Beat, scripted: boolean, said: string, decision: PlannerDecision, options: { feedbackFired?: boolean } = {}): Promise<void> => {
    const script = scriptRef.current;
    if (!script) return;
    sessionStatsRef.current.asked += 1;
    noteMastery(beat.conceptTag, decision.understood);
    recentAnswersRef.current.push({ question: beat.spokenText ?? beat.goal, answer: said, correct: decision.understood });
    if (recentAnswersRef.current.length > 4) recentAnswersRef.current.shift();
    // Correct → the burst on the answered element and a celebration; wrong
    // → the gentle wobble and an encouraging nod. Never both. The praise
    // or miss clip follows as the FEEDBACK beat.
    if (!options.feedbackFired) {
      fireFeedback(decision.understood ? "correct" : "wrong", answerTargetRef.current);
      setCharacterMood(decision.understood ? "celebrate" : "encourage");
    }
    if (beat.conceptTag !== FRAMING_CONCEPT) sessionStatsRef.current.concepts.add(beat.conceptTag);
    void recordMastery(beat, decision.understood);
    // The overlay under the abacus is drawn in the hand-digit face, which has
    // no Sinhala: a name answer (a read-aloud's chip) would render as tofu.
    // Digits go under the rods; a name is on the chip the child tapped.
    if (stageRef.current.base?.kind === "abacus" && said && !beat.rubric && /^[\d\s]+$/u.test(said)) dispatchStage({ primitive: "abacus", event: "child_answer_overlay", args: { text: said.replace(/\s/gu, "").slice(0, 24) } });

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
      await awaitRetry();
      await runQuestion(beat, scripted, { retry: true });
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
      await awaitRetry();
      await runQuestion(beat, scripted, { retry: true });
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
    // A predicate answer reveals one concrete example (never its JSON).
    const answer = exampleAnswerFor(beat.expectedAnswer).replace(/[\s,]/g, "");
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
      boardFocus: boardFocus(stageRef.current),
      recentAnswers: recentAnswersRef.current.slice(-2),
      weakestConcept: weakestRatio < 1 ? weakest : null,
    };
  };

  /** Pauses the lesson for a live conversation, and resumes when it ends. */
  const openChat = async () => {
    interruptRef.current = false;
    const player = playerRef.current;
    if (!player || stoppedRef.current) return;
    // The ✋ is the only place the microphone opens. The first time, she
    // says why before the browser asks; a refusal is a hint, not an error,
    // and the lesson simply carries on.
    if (!streamRef.current) {
      setRuntimeStatus("teaching");
      logEvent("first ✋: asking for the microphone");
      // The P1 sheet: her explanation plays while the sheet is up; the
      // child's "හරි, අවසර දෙන්න" (or "ටයිප් කරන්නම්") decides what follows.
      setMicAsk(true);
      const decision = new Promise<boolean>((resolve) => {
        micAskRef.current = resolve;
      });
      await sayAuthored(AUTHORED_LINES.micPermission);
      const granted = stoppedRef.current ? false : await decision;
      micAskRef.current = null;
      setMicAsk(false);
      if (!granted) {
        logEvent("microphone not asked — the child chose not to (typed chat is not available yet)");
        showHint("හරි, පාඩම දිගටම යමු", 2000);
        return;
      }
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        micOpensRef.current += 1;
        logEvent("microphone granted (chat)");
      } catch {
        logEvent("microphone refused — no chat");
        showHint("කටහඬ නැතුව කතා කරන්න බෑ — පාඩම දිගටම යමු", 3000);
        return;
      }
    }
    const stream = streamRef.current;
    if (!stream) return;
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
  /** DEV_MODE: a requested jump (session index, beat offset) taken at the next beat boundary. */
  const jumpRequestRef = useRef<{ session: number; beat: number | string } | null>(null);
  const runLesson = async () => {
    const script = scriptRef.current;
    if (!script) return;
    while (!stoppedRef.current) {
      while (pausedRef.current && !stoppedRef.current) await wait(200);
      if (stoppedRef.current) break;
      if (jumpRequestRef.current && !settingsRef.current.devMode) jumpRequestRef.current = null;
      if (jumpRequestRef.current) {
        // DEV_MODE only: land on session N's beat X (a later session can be
        // tested without playing the earlier ones). Pending beats are dropped,
        // the turn is closed, the board follows the beat as it always does.
        const request = jumpRequestRef.current;
        jumpRequestRef.current = null;
        // A beat id (or its prefix) is also accepted — harnesses land on a known board that way; it is looked up across the whole lesson and its session follows.
        const byId = typeof request.beat === "string" ? script.beats.findIndex((b) => b.id === request.beat || b.id.startsWith(request.beat as string)) : -1;
        const session = typeof request.beat === "string" && byId >= 0 ? Math.max(0, script.sessions.findIndex((s) => byId >= s.firstBeat && byId <= s.lastBeat)) : request.session;
        const beat = typeof request.beat === "string" ? (byId >= 0 ? byId - (script.sessions[session]?.firstBeat ?? 0) : 0) : request.beat;
        const target = script.sessions[session];
        if (target) {
          const index = Math.min(target.lastBeat, Math.max(target.firstBeat, target.firstBeat + beat));
          pendingBeatsRef.current = [];
          limitPendingRef.current = false;
          // The board the child would be looking at, had they played to here: every storyboard
          // event of every beat before this one, replayed silently. Without it a jump lands on a
          // later beat with an earlier board (the title card under an abacus question).
          let rebuilt = initialStage();
          for (let i = 0; i < index; i += 1) {
            const storyboarded = storyboardRef.current.get(script.beats[i]!.id);
            if (!storyboarded) continue;
            for (const event of storyboarded.events) if (isKnownEvent(event)) rebuilt = reduceStage(rebuilt, event, { legacy: null, lastBuilt: 1364 });
          }
          activeChoreoRef.current = null;
          setStage(rebuilt);
          stateRef.current = { ...stateRef.current, beatIndex: index, unaidedCorrect: 0, recentMisses: 0 };
          setCurrentSessionIndex(session);
          sessionIndexRef.current = session;
          logEvent(`DEV jump → session ${session + 1}, beat ${beat} (${script.beats[index]?.id.slice(0, 40)})`);
        }
      }

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
      if (!skipToCloseRef.current && !limitEndedRef.current && (limitPendingRef.current || dailyLimitReached())) {
        // The parent's daily limit: finish this sitting properly (its close
        // beat, so progress is saved) rather than cutting the child off —
        // and never in the middle of an exercise. A staged exercise and the
        // questions that work it are one unit: the limit waits for its last
        // question, then closes. (The device walk: a sitting stopped mid-table.)
        const at = stateRef.current.beatIndex;
        const unit = unitAt(exerciseUnits(script.beats), at);
        const insideUnit = unit !== undefined && at > unit.start;
        // A sitting with under three minutes of beats left is finished, not cut:
        // closing it early would save nothing and lose the ending.
        const sessionIndex = script.beats[at]?.sessionIndex ?? sessionIndexRef.current;
        const sessionEnd = script.sessions[sessionIndex]?.lastBeat ?? script.beats.length - 1;
        const remainingSeconds = script.beats.slice(at, sessionEnd + 1).reduce((sum, b) => sum + estimateBeatSeconds(b), 0);
        if (remainingSeconds < 180) {
          if (!limitPendingRef.current) {
            limitPendingRef.current = true;
            logEvent(`daily limit reached (${Math.round(effectiveDailyLimit())} min) with ${Math.round(remainingSeconds)}s of the sitting left — finishing it`);
          }
        } else if (insideUnit) {
          if (!limitPendingRef.current) {
            limitPendingRef.current = true;
            logEvent(`daily limit reached (${Math.round(effectiveDailyLimit())} min) mid-exercise — finishing it first (through ${script.beats[unit.end]?.id.slice(0, 40)})`);
          }
        } else {
          limitPendingRef.current = false;
          limitEndedRef.current = true;
          closeReasonRef.current = "daily_limit";
          setLimitEnded(true);
          logEvent(`daily limit reached (${Math.round(effectiveDailyLimit())} min, ${Math.round(minutesUsedToday())} used) — closing the sitting`);
          skipToCloseRef.current = true;
        }
      }
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
      `metrics cached=${Math.round(cachedSeconds)}s flash_audio=${Math.round(flashAudioSeconds)}s live=${liveSeconds}s mic_opens=${micOpensRef.current}`,
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
        // Why the sitting ended, on every sitting — the close row only exists when she said goodbye.
        planner_decision: { close_reason: closeReasonRef.current, minutes_today: Math.round(minutesUsedToday()), minutes_this_sitting: Math.round(minutesThisSitting()) },
        director_text:
          `close_reason=${closeReasonRef.current} minutes_today=${Math.round(minutesUsedToday())} ` +
          `cached_seconds=${Math.round(cachedSeconds)} flash_audio_seconds=${Math.round(flashAudioSeconds)} ` +
          `live_seconds=${liveSeconds} clips_played=${clipsPlayed} clips_rendered_on_demand=${clipsRendered} ` +
          // flash_audio_seconds is the lesson path's transcription time: 0 unless VOICE_ASSESSMENT is on.
          // live_seconds is the ✋ chat; mic_opens says how often the child chose to open it.
          `mic_opens=${micOpensRef.current} voice_assessment=${voiceAssessmentRef.current ? "on" : "off"}`,
        started_at: new Date().toISOString(),
      }),
    }).catch(() => undefined);
  };

  // -----------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------

  const stop = useCallback(() => {
    stoppedRef.current = true;
    // ⏹ — the child left. No CLOSE_SESSION row (leaving is not finishing), so
    // the reason rides the metrics row instead; the trace still says why.
    if (closeReasonRef.current === "complete") closeReasonRef.current = "stopped";
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
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload?.no_child) {
          // No child bound to this device: onboarding first (the page normally redirects before this).
          window.location.assign("/onboarding/1");
          return "error";
        }
        const raw = payload?.settings ?? {};
        const next: ChildRuntimeSettings = {
          captions: typeof raw.captions === "boolean" ? raw.captions : true,
          sound: typeof raw.sound === "boolean" ? raw.sound : true,
          dailyLimitMinutes: typeof raw.dailyLimitMinutes === "number" ? raw.dailyLimitMinutes : 30,
          minutesToday: typeof payload?.minutes_today === "number" ? payload.minutes_today : 0,
          devMode: payload?.dev_mode === true,
        };
        settingsRef.current = next;
        setChildSettings(next);
        return "ok";
      }
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
    pausedAtRef.current = null;
    pausedTotalRef.current = 0;
    lastActivityRef.current = 0;
    hasInputRef.current = false;
    limitEndedRef.current = false;
    limitPendingRef.current = false;
    closeReasonRef.current = "complete";
    setLimitEnded(false);

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
      voiceAssessmentRef.current = audioConfig?.voiceAssessment === true;
      if (voiceAssessmentRef.current) logEvent("VOICE_ASSESSMENT is on: the reading pause records and transcribes");
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

      // No microphone here: the lesson path is touch-only. The ✋ chat asks
      // for it, in her words, the first time the child taps it.
      const player = new PcmPlayer({ onPlaybackStateChange: setIsAiTalking });
      await player.resume();
      playerRef.current = player;

      setRuntimeStatus("teaching");
      await runLesson();
    } catch (err) {
      console.error("[useLessonRuntime] Could not start the lesson:", err);
      closeReasonRef.current = "error";
      void reportMetrics();
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
      pausedAtRef.current = Date.now();
      recorderRef.current?.cancel();
      void playerRef.current?.suspend();
    } else {
      if (pausedAtRef.current !== null) pausedTotalRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
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
  /**
   * ⏹ — LEAVE the lesson. The sitting is not finished: no CLOSE_SESSION beat
   * runs and no close row is logged, so the session stays in progress and
   * resume comes back to the beat the child was on (the in-flight beat is
   * never logged — see runBeat). Completion happens only when the runtime
   * reaches the session's own CLOSE_SESSION beat.
   */
  const leaveSession = useCallback(() => {
    pendingBeatsRef.current = [];
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ↺ — restart THIS session from its first beat: the sitting's rows go
   * (child_progress, the mastery record, stays) and the lesson reloads at
   * beat 0. Everything playing or queued is stopped before the restart.
   */
  const restartThisSession = useCallback(async (): Promise<boolean> => {
    const index = activeBeatRef.current?.sessionIndex ?? sessionIndexRef.current;
    pendingBeatsRef.current = [];
    playerRef.current?.clear();
    recorderRef.current?.cancel();
    stoppedRef.current = true;
    try {
      const response = await fetch("/api/session/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson, session: Math.max(0, index) }),
      });
      const json = await response.json();
      return json?.ok === true;
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The P1 sheet's answer: "හරි, අවසර දෙන්න" (true) or "ටයිප් කරන්නම්" (false). */
  const answerMicAsk = useCallback((granted: boolean) => {
    micAskRef.current?.(granted);
  }, []);

  /** ✋ — the child asks to talk. Opens at the next safe moment. */
  const requestChat = useCallback(() => {
    if (statusRef.current === "chatting") {
      chat.endChat();
      return;
    }
    chatRequestedRef.current = true;
    interruptRef.current = true;
    playerRef.current?.clear();
    tapResolveRef.current?.();
    recorderRef.current?.finish();
  }, [chat]);

  /** A tapped answer (number pad / choice) — the same path as a spoken one. */
  const submitTypedAnswer = useCallback((text: string) => {
    lastActivityRef.current = lessonNow();
    hasInputRef.current = false;
    padAnswerRef.current = text;
    (window as unknown as { __lastTapAt?: number }).__lastTapAt = performance.now();
    tapResolveRef.current?.();
    recorderRef.current?.finish();
  }, []);

  const resumeAudioOutput = useCallback(() => {
    if (!pausedRef.current) void playerRef.current?.resume();
  }, []);

  const getOutputAmplitude = useCallback(() => playerRef.current?.getAmplitude() ?? 0, []);

  /**
   * DEV_MODE only: the daily limit is OFF by default there (a harness run or
   * a demo must never be cut short mid-way), and this cycles it
   * off → 3 min → the parent's setting → off. The overlay shows the minutes
   * used today beside it.
   */
  /** DEV_MODE: jump to session N (0-based) beat X — taken at the next beat boundary; also on window.__dev.jump for harnesses. */
  const chatTranscriptRef = useRef(chat.transcript);
  useEffect(() => {
    chatTranscriptRef.current = chat.transcript;
  }, [chat.transcript]);
  const jumpTo = (session: number, beat: number | string) => {
    // Stored now, honoured (DEV_MODE only) when the driver reaches its next beat boundary — the settings may still be loading when a harness asks.
    jumpRequestRef.current = { session, beat };
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as { __dev?: Record<string, unknown> }).__dev = {
      jump: (session: number, beat: number | string) => jumpTo(session, beat),
      setDailyLimit: (minutes: number | null) => {
        if (!settingsRef.current.devMode) return;
        devLimitOverrideRef.current = minutes;
        setDevLimit(minutes);
      },
      /** The ✋ verification (chat-live-check): type into the open chat as the child would speak. */
      chatSend: (text: string) => {
        if (!settingsRef.current.devMode) return false;
        return chat.sendText(text);
      },
      chatTranscript: () => chatTranscriptRef.current,
      chatError: () => chat.error,
      /** The ✋ verification: the very context the chat is opened with — the board and the one thing the child is pointing at. */
      chatContext: () => (settingsRef.current.devMode ? buildChatContext() : null),
      /** Lip-sync drill: four seconds of tone — loud, medium, soft, then silence — through the same player and analyser as her voice. */
      playTestClip: () => {
        if (!settingsRef.current.devMode) return false;
        const player = playerRef.current;
        if (!player) return false;
        const rate = 24000;
        const seconds = [0.6, 0.15, 0.04, 0];
        const pcm = new Int16Array(rate * seconds.length);
        for (let i = 0; i < pcm.length; i += 1) {
          const amp = seconds[Math.floor(i / rate)] ?? 0;
          pcm[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * amp * 0x7fff);
        }
        player.enqueue(arrayBufferToBase64(pcm.buffer));
        return true;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycleDailyLimit = () => {
    if (!settingsRef.current.devMode) return;
    const order: Array<number | null> = [null, 3, settingsRef.current.dailyLimitMinutes];
    const next = order[(order.findIndex((v) => v === devLimitOverrideRef.current) + 1) % order.length] ?? null;
    devLimitOverrideRef.current = next;
    setDevLimit(next);
    logEvent(`daily limit (DEV_MODE): ${next === null ? "off" : `${next} min`}`);
  };

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
      // "why did it stop?" answered on the device itself: how much of today is used, what the limit is, and what the close will say.
      minutesToday: Math.round(minutesUsedToday()),
      dailyLimit: effectiveDailyLimit(),
      closeReason: closeReasonRef.current + (limitPendingRef.current ? " (pending — finishing the exercise)" : ""),
      /** The ✋ connection's last error (cluster H item 12) — shown in the overlay, never swallowed. */
      chatError: chat.error,
      chatStatus: chat.chatting ? "connected" : "idle",
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
    /** The first-✋ explanation sheet is up (the design's P1). */
    micAsk,
    answerMicAsk,
    holdFor,
    noteIdleTouch,
    /** Any child interaction on the lesson screen: the inactivity ladder counts from here. */
    noteActivity,
    /** A surface holds input (digits, tiles, a word) — it never times out while it does. */
    noteInput,
    /** The opt-in reading assessment's voice path (VOICE_ASSESSMENT=on): nothing on the lesson path calls it while the flag is off. */
    voiceAssessment: { listen: listenForAnswerVoice, judge: judgeSpokenAnswer, enabled: () => voiceAssessmentRef.current },
    muted,
    paused,
    chatting: chat.chatting,
    /** The ✋ connection's last error (surfaced in the overlay and on the lesson root for harnesses). */
    chatError: chat.error,
    /** The ✋ sheet's two-line live transcript. */
    chatTranscript: chat.transcript,
    start,
    stop,
    togglePause,
    toggleMute,
    /** ⏹ — leave without finishing: nothing is closed, resume returns here. */
    leaveSession,
    /** ↺ — clear this session's rows and start it again at beat 0. */
    restartThisSession,
    /** Which lesson this runtime is teaching (the restart and the leave route need it). */
    lesson,
    requestChat,
    submitTypedAnswer,
    resumeAudioOutput,
    getOutputAmplitude,
    getDebugSnapshot,
    submitAccessCode,
    /** Captions / sound / daily limit from /api/session-start (null until the session cookie is minted). */
    childSettings,
    /** The daily limit ended this sitting. */
    limitEnded,
    /** DEV_MODE: the limit override in force (null = off), and the control that cycles it. */
    devLimit,
    cycleDailyLimit,
    /** DEV_MODE: jump to session N (0-based) beat X. */
    jumpTo,
  };
}


function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
