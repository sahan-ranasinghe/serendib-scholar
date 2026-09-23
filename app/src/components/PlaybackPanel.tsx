"use client";

/**
 * The playback panel (23 Sep 2026, the director's request): ⏸ opens it at
 * the foot of the paused card — ⏮ ⏭ and a row of step marks for this
 * session, the current one highlighted. A lesson is steps, not a video, so
 * it navigates by beat (useLessonRuntime.requestNav):
 *
 *   ⏮  more than two seconds into the current line replays the line from
 *       its start; earlier, the previous beat — the board restores that
 *       beat's snapshot.
 *   ⏭  forward one beat, never past the furthest beat reached (a child
 *       cannot skip a question they have not answered).
 *   a step mark  any reached beat.
 *
 * A session has over a hundred beats, so the marks are one strip (a 56 px
 * touch target, rule 7): a tap lands on the mark under the finger. Marks
 * past the furthest are faint and take no tap; answered questions carry a
 * dot. The glyphs' accessible names are English, like the pad's "done"
 * (docs/review/app-copy.md lists the Sinhala still needed).
 */
import type { PointerEvent } from "react";
import type { NavInfo } from "@/hooks/useLessonRuntime";

export function PlaybackPanel({ info, onBack, onForward, onGoto }: { info: NavInfo; onBack: () => void; onForward: () => void; onGoto: (index: number) => void }) {
  const steps: number[] = [];
  for (let i = info.first; i <= info.last; i += 1) steps.push(i);
  const canForward = info.current < info.furthest;
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || steps.length === 0) return;
    const at = Math.min(steps.length - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * steps.length)));
    const index = steps[at]!;
    if (index > info.furthest) return;
    onGoto(index);
  };
  const button = (label: string, glyph: string, testId: string, disabled: boolean, onPress: () => void) => (
    <button
      type="button"
      className="wb-tap"
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      style={{
        width: 56,
        height: 56,
        flex: "none",
        border: 0,
        borderRadius: "50%",
        background: disabled ? "rgba(255,255,255,.18)" : "var(--color-paper)",
        color: disabled ? "rgba(255,255,255,.45)" : "var(--color-teal)",
        boxShadow: disabled ? "none" : "0 2px 0 #D8D1C2",
        font: "700 24px/1 var(--font-latin)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {glyph}
    </button>
  );
  return (
    <div data-testid="playback-panel" data-current={info.current} data-furthest={info.furthest} style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", gap: 12, padding: "10px 16px 12px", background: "rgba(27,27,27,.62)", boxSizing: "border-box" }}>
      {button("previous step", "⏮", "nav-back", false, onBack)}
      <div
        data-testid="nav-steps"
        role="group"
        aria-label="steps of this session"
        onPointerDown={pick}
        style={{ flex: 1, minWidth: 0, height: 56, display: "flex", alignItems: "center", gap: 2, touchAction: "none", cursor: "pointer" }}
      >
        {steps.map((index) => {
          const current = index === info.current;
          const reached = index <= info.furthest;
          const answered = info.answered.includes(index);
          return (
            <span
              key={index}
              data-step={index}
              data-reached={reached || undefined}
              data-current={current || undefined}
              data-answered={answered || undefined}
              style={{
                flex: 1,
                minWidth: 2,
                height: current ? 16 : answered ? 10 : 6,
                borderRadius: 3,
                background: current ? "var(--color-saffron)" : reached ? (answered ? "var(--color-success)" : "rgba(255,255,255,.85)") : "rgba(255,255,255,.22)",
                transition: "height 150ms",
              }}
            />
          );
        })}
      </div>
      {button("next step", "⏭", "nav-forward", !canForward, onForward)}
    </div>
  );
}
