"use client";

/**
 * The recording engine behind /portal.
 *
 * MediaRecorder for the bytes (48kHz mono, whatever container the browser
 * prefers — ffmpeg reads them all), and a parallel AnalyserNode for the
 * things a recording actor actually needs to see and feel:
 *
 *   - a live level meter, so she knows the mic is open before she speaks,
 *   - clip and noise-floor warnings, because a take that peaks red is a
 *     take she will have to do again and should be told about now,
 *   - auto-stop after SILENCE_STOP_MS of quiet FOLLOWING speech, so she
 *     never has to reach for the keyboard with a held breath. Silence
 *     before she starts never stops the take.
 *
 * The stream is opened once and kept, not re-acquired per line: a
 * getUserMedia prompt between every take would make a two-hour session
 * unbearable, and re-opening the device changes the gain on some phones.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Quiet for this long AFTER speech ends the take. */
export const SILENCE_STOP_MS = 1500;
/** Below this RMS is "not speech". */
const SPEECH_RMS = 0.02;
/** Peaks above this are close enough to full scale to warn about. */
const CLIP_PEAK = 0.97;
/** A room quieter than this reads as a usable noise floor. */
const NOISE_FLOOR_RMS = 0.02;
const MAX_TAKE_MS = 90_000;

export interface TakeResult {
  blob: Blob;
  durationMs: number;
  peakDbfs: number;
  noiseDbfs: number;
}

export type RecorderPhase = "idle" | "counting" | "recording";

const dbfs = (amplitude: number): number => (amplitude <= 0 ? -100 : Math.round(20 * Math.log10(amplitude) * 10) / 10);

export function useTakeRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [noiseFloor, setNoiseFloor] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const resolveRef = useRef<((result: TakeResult | null) => void) | null>(null);
  const frameRef = useRef<number | null>(null);
  const statsRef = useRef({ peak: 0, quietSum: 0, quietCount: 0, startedAt: 0, spokeAt: 0, lastLoudAt: 0 });

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

  // The meter runs whenever the stream is open, recording or not: she
  // should be able to check her level and her room before pressing record.
  useEffect(() => {
    const buffer = new Float32Array(2048);
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
        setLevel(rms);
        setPeak((previous) => Math.max(previous * 0.995, framePeak));

        const stats = statsRef.current;
        const now = performance.now();
        if (recorderRef.current?.state === "recording") {
          stats.peak = Math.max(stats.peak, framePeak);
          if (rms > SPEECH_RMS) {
            if (!stats.spokeAt) stats.spokeAt = now;
            stats.lastLoudAt = now;
          } else {
            stats.quietSum += rms;
            stats.quietCount += 1;
            // Only after she has actually said something.
            if (stats.spokeAt && now - stats.lastLoudAt > SILENCE_STOP_MS) stopInternal();
          }
          if (now - stats.startedAt > MAX_TAKE_MS) stopInternal();
        } else {
          setNoiseFloor(rms);
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
  const start = useCallback(
    async (onCount?: (n: number) => void): Promise<TakeResult | null> => {
      const stream = await ensureStream();
      if (!stream) return null;
      if (contextRef.current?.state === "suspended") await contextRef.current.resume();

      setPhase("counting");
      for (let n = 3; n >= 1; n -= 1) {
        setCountdown(n);
        onCount?.(n);
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      setCountdown(0);

      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : undefined);
      chunksRef.current = [];
      statsRef.current = { peak: 0, quietSum: 0, quietCount: 0, startedAt: performance.now(), spokeAt: 0, lastLoudAt: performance.now() };
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      const finished = new Promise<TakeResult | null>((resolve) => {
        resolveRef.current = resolve;
      });
      recorder.onstop = () => {
        const stats = statsRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setPhase("idle");
        recorderRef.current = null;
        resolveRef.current?.(
          blob.size === 0
            ? null
            : {
                blob,
                durationMs: Math.round(performance.now() - stats.startedAt),
                peakDbfs: dbfs(stats.peak),
                noiseDbfs: dbfs(stats.quietCount > 0 ? stats.quietSum / stats.quietCount : 0),
              },
        );
        resolveRef.current = null;
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setPhase("recording");
      return finished;
    },
    [ensureStream],
  );

  const stop = useCallback(() => stopInternal(), [stopInternal]);

  return {
    phase,
    countdown,
    level,
    peak,
    noiseFloor,
    micError,
    clipping: peak > CLIP_PEAK,
    roomNoisy: noiseFloor > NOISE_FLOOR_RMS,
    ensureStream,
    start,
    stop,
  };
}
