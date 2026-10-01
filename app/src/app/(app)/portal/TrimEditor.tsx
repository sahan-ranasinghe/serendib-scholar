"use client";

import { useEffect, useRef, useState } from "react";
import { audio } from "@/lib/audioManager";

/**
 * A waveform with a handle at each end.
 *
 * Trimming is NON-DESTRUCTIVE: the handles are two numbers sent with the
 * take, and the raw recording is uploaded and kept whole. Nothing is cut
 * until she keeps the line, and even then the original is still in the
 * bucket — so a trim that went too far costs a re-trim, never a re-record.
 */
export function TrimEditor({
  blob,
  trim,
  onChange,
  onPlay,
}: {
  blob: Blob;
  trim: { startMs: number; endMs: number | null };
  onChange: (trim: { startMs: number; endMs: number | null }) => void;
  onPlay: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  // Decode once per take and draw a peak-per-column envelope.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Decoded offline by the audio manager (it owns every AudioContext; nothing is played here).
        const decoded = await audio.decodeFile(await blob.arrayBuffer());
        if (cancelled) return;
        setDurationMs(Math.round(decoded.duration * 1000));
        const canvas = canvasRef.current;
        if (!canvas) return;
        const width = canvas.width;
        const height = canvas.height;
        const paint = canvas.getContext("2d");
        if (!paint) return;
        const data = decoded.getChannelData(0);
        const per = Math.floor(data.length / width) || 1;
        paint.clearRect(0, 0, width, height);
        paint.fillStyle = "#0ea5e9";
        for (let x = 0; x < width; x += 1) {
          let peak = 0;
          for (let i = 0; i < per; i += 1) peak = Math.max(peak, Math.abs(data[x * per + i] ?? 0));
          const barHeight = Math.max(1, peak * height);
          paint.fillRect(x, (height - barHeight) / 2, 1, barHeight);
        }
      } catch {
        /* an undecodable container still uploads fine; the waveform is a convenience */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  const endMs = trim.endMs ?? durationMs;
  const pct = (ms: number) => (durationMs > 0 ? Math.max(0, Math.min(100, (ms / durationMs) * 100)) : 0);

  const moveHandle = (clientX: number, element: HTMLElement) => {
    if (!dragging || durationMs === 0) return;
    const rect = element.getBoundingClientRect();
    const ms = Math.round(((clientX - rect.left) / rect.width) * durationMs);
    if (dragging === "start") onChange({ ...trim, startMs: Math.max(0, Math.min(ms, endMs - 100)) });
    else onChange({ ...trim, endMs: Math.min(durationMs, Math.max(ms, trim.startMs + 100)) });
  };

  return (
    <div className="w-full max-w-2xl">
      <div
        className="relative h-20 w-full touch-none select-none rounded-lg border border-stone-300 bg-stone-50"
        onPointerMove={(event) => moveHandle(event.clientX, event.currentTarget)}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        <canvas ref={canvasRef} width={800} height={80} className="h-full w-full" />
        <div className="absolute inset-y-0 left-0 bg-stone-900/30" style={{ width: `${pct(trim.startMs)}%` }} />
        <div className="absolute inset-y-0 right-0 bg-stone-900/30" style={{ width: `${100 - pct(endMs)}%` }} />
        <button
          type="button"
          aria-label="Trim start"
          onPointerDown={() => setDragging("start")}
          className="absolute inset-y-0 w-4 -translate-x-1/2 cursor-ew-resize bg-sky-600/80"
          style={{ left: `${pct(trim.startMs)}%` }}
        />
        <button
          type="button"
          aria-label="Trim end"
          onPointerDown={() => setDragging("end")}
          className="absolute inset-y-0 w-4 -translate-x-1/2 cursor-ew-resize bg-sky-600/80"
          style={{ left: `${pct(endMs)}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
        <span>
          {(trim.startMs / 1000).toFixed(2)}s → {(endMs / 1000).toFixed(2)}s
        </span>
        <button type="button" onClick={onPlay} className="rounded border border-stone-300 px-2 py-0.5">
          ▶ Play take
        </button>
      </div>
    </div>
  );
}
