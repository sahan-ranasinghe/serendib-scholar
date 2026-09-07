"use client";

/**
 * Always visible, recording or not. An actor should be able to see the mic
 * is live before she commits to a take — and see a clipped peak the moment
 * it happens rather than on playback.
 */
export function LevelMeter({
  level,
  peak,
  clipping,
  noisy,
}: {
  level: number;
  peak: number;
  clipping: boolean;
  noisy: boolean;
}) {
  const width = Math.min(100, Math.round(level * 320));
  const peakLeft = Math.min(100, Math.round(peak * 320));
  return (
    <div className="flex items-center gap-2" title={clipping ? "Clipping" : noisy ? "Noisy room" : "Input level"}>
      <div className="relative h-3 w-28 overflow-hidden rounded-full bg-stone-200">
        <div
          className={`h-full transition-[width] duration-75 ${clipping ? "bg-rose-500" : noisy ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${width}%` }}
        />
        <div className="absolute top-0 h-full w-0.5 bg-stone-700" style={{ left: `${peakLeft}%` }} />
      </div>
    </div>
  );
}
