"use client";

/**
 * The recording engine behind /portal.
 *
 * MediaRecorder for the bytes (48kHz mono, whatever container the browser
 * prefers — ffmpeg reads them all), and a parallel AnalyserNode for the
 * things a recording actor needs to see and feel.
 *
 * NOTHING HERE SETS REACT STATE PER FRAME. An earlier version called
 * setLevel/setPeak/setNoiseFloor from the animation loop, which re-rendered
 * the whole portal sixty times a second: the page visibly flickered on
 * every device, and — because the analyser outlives the take — it kept
 * flickering after the first recording whether or not she was recording.
 * The meter values live in `meters`, a ref the loop mutates; the level bar
 * and the auto-stop ring read that ref from their own animation frame and
 * write the DOM directly. React re-renders only when something a person
 * would call an EVENT happens: phase, countdown, mic error, or a warning
 * flag flipping.
 *
 * AUTO-STOP is deliberately reluctant. It fires only after
 * MIN_RECORD_MS of recording, only after she has actually spoken, and only
 * after SILENCE_STOP_MS of quiet measured against HER room rather than a
 * fixed number — a trained actor pausing for effect in a quiet room at low
 * volume was being cut off mid-sentence. The last second is shown as a
 * closing ring so she can simply keep talking, and the whole thing can be
 * switched off for a session.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Quiet for this long, after speech, ends the take. */
export const SILENCE_STOP_MS = 2500;
/** Auto-stop cannot fire before this — no take is meant to be shorter. */
export const MIN_RECORD_MS = 3000;
/** The ring appears for this long before the stop. */
export const STOP_WARNING_MS = 1000;
/** The room is measured for this long at the top of each take. */
const CALIBRATE_MS = 1000;
/** Speech is this many times louder than the measured floor. */
const SPEECH_OVER_FLOOR = 3.5;
/** Floor used until calibration has something better, and its lower bound. */
const MIN_SPEECH_RMS = 0.008;
/** Peaks above this are close enough to full scale to warn about. */
const CLIP_PEAK = 0.97;
/** A room quieter than this reads as a usable noise floor. */
const NOISE_FLOOR_RMS = 0.02;
const MAX_TAKE_MS = 180_000;

export interface TakeResult {
  blob: Blob;
  durationMs: number;
  peakDbfs: number;
  noiseDbfs: number;
}

export type RecorderPhase = "idle" | "counting" | "recording";

/**
 * Live meter values. Mutated in place by the analysis loop and READ by
 * animation frames elsewhere — never rendered from directly, or the
 * flicker comes straight back.
 */
export interface Meters {
  level: number;
  peak: number;
  noiseFloor: number;
  /** ms until auto-stop fires, or null when it is not imminent/enabled. */
  stopInMs: number | null;
  recording: boolean;
}

/**
 * Should this take stop now, and how long is left before it does?
 *
 * Pure, and exported, because the old auto-stop cut a trained actor off
 * mid-sentence and "we changed a constant" is not evidence. Every rule
 * that made it too eager is a parameter here and a case in
 * useTakeRecorder.test.ts:
 *
 *   - it cannot fire in the first MIN_RECORD_MS, however quiet the room,
 *   - it cannot fire before she has said anything,
 *   - "quiet" is measured against HER calibrated floor, not a fixed level,
 *     because a quiet room at low speaking volume sits below any constant
 *     that also works in a noisy one,
 *   - it cannot fire at all when she has switched it off.
 */
export function autoStopDecision(input: {
  enabled: boolean;
  spoke: boolean;
  elapsedMs: number;
  quietForMs: number;
}): { stop: boolean; warnInMs: number | null } {
  const eligible = input.enabled && input.spoke && input.elapsedMs >= MIN_RECORD_MS;
  if (!eligible) return { stop: false, warnInMs: null };
  if (input.quietForMs > SILENCE_STOP_MS) return { stop: true, warnInMs: 0 };
  const remaining = SILENCE_STOP_MS - input.quietForMs;
  return { stop: false, warnInMs: remaining <= STOP_WARNING_MS ? remaining : null };
}

/**
 * The speech threshold for a take, from the room measured at its start.
 * Floored so that a pathologically silent measurement cannot make every
 * breath count as speech.
 */
export function speechThreshold(measuredFloorRms: number): number {
  return Math.max(MIN_SPEECH_RMS, measuredFloorRms * SPEECH_OVER_FLOOR);
}

const dbfs = (amplitude: number): number => (amplitude <= 0 ? -100 : Math.round(20 * Math.log10(amplitude) * 10) / 10);

export function useTakeRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [clipping, setClipping] = useState(false);
  const [roomNoisy, setRoomNoisy] = useState(false);
  const [autoStop, setAutoStop] = useState(true);

  const meters = useRef<Meters>({ level: 0, peak: 0, noiseFloor: 0, stopInMs: null, recording: false });
  // Mirrored into a ref because the analysis loop reads it every frame and
  // must not be re-created when she toggles it mid-session.
  const autoStopRef = useRef(true);
  useEffect(() => {
    autoStopRef.current = autoStop;
  }, [autoStop]);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const resolveRef = useRef<((result: TakeResult | null) => void) | null>(null);
  const frameRef = useRef<number | null>(null);
  const takeRef = useRef({
    peak: 0,
    floorSum: 0,
    floorCount: 0,
    threshold: MIN_SPEECH_RMS,
    quietSum: 0,
    quietCount: 0,
    startedAt: 0,
    spoke: false,
    lastLoudAt: 0,
  });

  /** One permission prompt per session, then the meter runs continuously. */
  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const context = new AudioContext({ sampleRate: 48000 });
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      contextRef.current = context;
      analyserRef.current = analyser;
      setMicError(null);
      return stream;
    } catch (error) {
      setMicError(
        String((error as Error)?.name) === "NotAllowedError"
          ? "Microphone permission was refused — allow it in the browser bar and reload."
          : "No microphone found.",
      );
      return null;
    }
  }, []);

  const stopInternal = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  }, []);

  /**
   * The analysis loop. Runs whenever the stream is open — she should be
   * able to check her level and her room before pressing record — and
   * writes to `meters.current` only. The two setState calls in here fire
   * on a BOOLEAN EDGE (a warning appearing or clearing), which happens
   * seconds apart, not per frame.
   */
  useEffect(() => {
    const buffer = new Float32Array(2048);
    let lastClipping = false;
    let lastNoisy = false;
    const tick = () => {
      const analyser = analyserRef.current;
      if (analyser) {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        let framePeak = 0;
        for (const sample of buffer) {
          sum += sample * sample;
          framePeak = Math.max(framePeak, Math.abs(sample));
        }
        const rms = Math.sqrt(sum / buffer.length);
        const live = meters.current;
        live.level = rms;
        live.peak = Math.max(live.peak * 0.995, framePeak);

        const take = takeRef.current;
        const now = performance.now();
        const isRecording = recorderRef.current?.state === "recording";
        live.recording = isRecording;

        if (isRecording) {
          const elapsed = now - take.startedAt;
          take.peak = Math.max(take.peak, framePeak);

          // Calibrate against HER room for the first second, then hold.
          if (elapsed < CALIBRATE_MS) {
            take.floorSum += rms;
            take.floorCount += 1;
            take.threshold = speechThreshold(take.floorSum / take.floorCount);
            live.noiseFloor = take.floorSum / take.floorCount;
          }

          if (rms > take.threshold) {
            take.spoke = true;
            take.lastLoudAt = now;
            live.stopInMs = null;
          } else {
            take.quietSum += rms;
            take.quietCount += 1;
            const decision = autoStopDecision({
              enabled: autoStopRef.current,
              spoke: take.spoke,
              elapsedMs: elapsed,
              quietForMs: now - take.lastLoudAt,
            });
            live.stopInMs = decision.warnInMs;
            if (decision.stop) stopInternal();
          }
          if (elapsed > MAX_TAKE_MS) stopInternal();
        } else {
          live.noiseFloor = rms;
          live.stopInMs = null;
        }

        // Boolean edges only — these are the sole setState calls here.
        const nowClipping = live.peak > CLIP_PEAK;
        if (nowClipping !== lastClipping) {
          lastClipping = nowClipping;
          setClipping(nowClipping);
        }
        const nowNoisy = !isRecording && live.noiseFloor > NOISE_FLOOR_RMS;
        if (nowNoisy !== lastNoisy) {
          lastNoisy = nowNoisy;
          setRoomNoisy(nowNoisy);
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [stopInternal]);

  /**
   * 3 → 2 → 1 → record. The countdown is not decoration: without it she is
   * caught mid-breath on the first syllable of every take, and every take
   * needs trimming.
   */
  const start = useCallback(async (): Promise<TakeResult | null> => {
    const stream = await ensureStream();
    if (!stream) return null;
    if (contextRef.current?.state === "suspended") await contextRef.current.resume();

    setPhase("counting");
    for (let n = 3; n >= 1; n -= 1) {
      setCountdown(n);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    setCountdown(0);

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : undefined);
    chunksRef.current = [];
    takeRef.current = {
      peak: 0,
      floorSum: 0,
      floorCount: 0,
      threshold: MIN_SPEECH_RMS,
      quietSum: 0,
      quietCount: 0,
      startedAt: performance.now(),
      spoke: false,
      lastLoudAt: performance.now(),
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    const finished = new Promise<TakeResult | null>((resolve) => {
      resolveRef.current = resolve;
    });
    recorder.onstop = () => {
      const take = takeRef.current;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      meters.current.stopInMs = null;
      meters.current.recording = false;
      setPhase("idle");
      recorderRef.current = null;
      resolveRef.current?.(
        blob.size === 0
          ? null
          : {
              blob,
              durationMs: Math.round(performance.now() - take.startedAt),
              peakDbfs: dbfs(take.peak),
              noiseDbfs: dbfs(take.quietCount > 0 ? take.quietSum / take.quietCount : 0),
            },
      );
      resolveRef.current = null;
    };

    recorderRef.current = recorder;
    recorder.start(250);
    setPhase("recording");
    return finished;
  }, [ensureStream]);

  const stop = useCallback(() => stopInternal(), [stopInternal]);

  return {
    phase,
    countdown,
    micError,
    clipping,
    roomNoisy,
    autoStop,
    setAutoStop,
    /** Live values for imperative readers. Never render from this. */
    meters,
    ensureStream,
    start,
    stop,
  };
}
