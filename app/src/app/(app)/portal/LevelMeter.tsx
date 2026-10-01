"use client";

/**
 * The input meter and the auto-stop ring, drawn from a ref.
 *
 * Both read `meters.current` on their own animation frame and write style
 * properties straight onto DOM nodes. Neither holds React state, so
 * neither can re-render the portal — which is what the level meter used to
 * do sixty times a second, flickering the whole page.
 *
 * Always visible: an actor should be able to see the mic is live before
 * she commits to a take, and see a clipped peak the moment it happens
 * rather than on playback.
 */
import { useEffect, useRef } from "react";
import type { Meters } from "@/hooks/useTakeRecorder";
import { SILENCE_STOP_MS, STOP_WARNING_MS } from "@/hooks/useTakeRecorder";

export function LevelMeter({
  meters,
  clipping,
  noisy,
}: {
  meters: React.RefObject<Meters>;
  clipping: boolean;
  noisy: boolean;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const peakRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const live = meters.current;
      if (barRef.current) barRef.current.style.width = `${Math.min(100, live.level * 320)}%`;
      if (peakRef.current) peakRef.current.style.left = `${Math.min(100, live.peak * 320)}%`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [meters]);

  return (
    <div
      className="flex items-center gap-2"
      title={clipping ? "Clipping" : noisy ? "Noisy room" : "Input level"}
      data-portal="level-meter"
    >
      <div className="relative h-3 w-28 overflow-hidden rounded-full bg-stone-300">
        <div
          ref={barRef}
          className={`h-full w-0 ${clipping ? "bg-rose-600" : noisy ? "bg-amber-500" : "bg-emerald-600"}`}
        />
        <div ref={peakRef} className="absolute top-0 h-full w-0.5 bg-stone-900" style={{ left: "0%" }} />
      </div>
    </div>
  );
}

/**
 * The last second before auto-stop, as a closing ring.
 *
 * Without it the take simply ends and she discovers it afterwards; with it
 * she can see the silence being counted and keep talking. Hidden whenever
 * a stop is not imminent, so it is not another thing blinking at her.
 */
export function StopRing({ meters }: { meters: React.RefObject<Meters> }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const arcRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    const CIRCUMFERENCE = 2 * Math.PI * 20;
    let frame = 0;
    const tick = () => {
      const remaining = meters.current.stopInMs;
      if (wrapRef.current) wrapRef.current.style.opacity = remaining === null ? "0" : "1";
      if (arcRef.current && remaining !== null) {
        const fraction = Math.max(0, Math.min(1, remaining / STOP_WARNING_MS));
        arcRef.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - fraction));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [meters]);

  const CIRCUMFERENCE = 2 * Math.PI * 20;
  return (
    <div
      ref={wrapRef}
      className="pointer-events-none flex items-center gap-2 opacity-0 transition-opacity"
      data-portal="stop-ring"
      aria-hidden
    >
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="20" fill="none" stroke="#e7e5e4" strokeWidth="4" />
        <circle
          ref={arcRef}
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="#e11d48"
          strokeWidth="4"
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={0}
        />
      </svg>
      <span className="text-sm font-medium text-rose-700">
        stopping — keep talking to continue ({(SILENCE_STOP_MS / 1000).toFixed(1)}s of silence)
      </span>
    </div>
  );
}
