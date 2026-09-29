"use client";

/**
 * The playback panel (23 Sep 2026): ⏸ opens it BESIDE the board — the board
 * reflows into the room that is left, the way it does for the ✋ chat — and
 * the lesson stays paused for as long as it is open. It SCRUBS: every step
 * selects a beat and shows it, silently (useLessonRuntime.navigate); nothing
 * plays until ▶ දිගටම, which closes the panel and plays from the selected
 * beat.
 *
 *   where you are   "ගණක රාමුව · 3 වෙනි පියවර", above everything
 *   concept chips   one per concept in this session, in order: a tap
 *                   selects the concept's first beat. How a child thinks
 *                   about going back — to a part of the lesson. A concept
 *                   not reached yet is shown, and cannot be chosen.
 *   ⏮ ⏭            one tap, one beat (a double-tap is one step: the app's
 *                   single-fire guard); ⏭ stops at the furthest reached.
 *   step marks      a POSITION DISPLAY only — the selected beat, the
 *                   answered questions, how far the sitting has reached.
 *                   Dense marks on a phone are not a touch target for a
 *                   nine-year-old, so they take no taps.
 *   🔊 ආයෙත් අහන්න  the selected beat's line, once, on demand.
 *   ▶ දිගටම         close the panel and play from the selected beat.
 *
 * ⏹ and ↺ stay on the strip. The glyph buttons' accessible names are
 * English, like the pad's "done" (docs/review/app-copy.md, MISSING).
 */
import { t } from "@/lib/appCopy";
import type { NavInfo } from "@/hooks/useLessonRuntime";

export function PlaybackPanel({ info, onBack, onForward, onConcept, onListen, onResume }: { info: NavInfo; onBack: () => void; onForward: () => void; onConcept: (tag: string) => void; onListen: () => void; onResume: () => void }) {
  const marks: number[] = [];
  for (let i = info.first; i <= info.last; i += 1) marks.push(i);
  const selectedConcept = [...info.concepts].reverse().find((c) => c.first <= info.selected)?.tag ?? null;
  const round = (label: string, glyph: string, testId: string, disabled: boolean, onPress: () => void) => (
    <button type="button" className="playback-round wb-tap" data-testid={testId} aria-label={label} disabled={disabled} onClick={onPress}>
      {glyph}
    </button>
  );
  return (
    <aside className="playback-panel" data-testid="playback-panel" data-current={info.current} data-selected={info.selected} data-furthest={info.furthest} aria-label={t("nav.panel")}>
      <div className="playback-position" data-testid="nav-position">
        {info.position.title} · {t("nav.stepN", { n: info.position.step })}
      </div>
      {/* The lesson's parts (the chips name themselves) — not "steps", which is what ⏮ ⏭ and the position count. */}
      <div className="playback-concepts" role="group">
        {info.concepts.map((concept) => (
          <button
            key={concept.tag}
            type="button"
            className="playback-concept wb-tap"
            data-testid="nav-concept"
            data-concept={concept.tag}
            data-reached={concept.reached || undefined}
            data-at={concept.tag === selectedConcept || undefined}
            disabled={!concept.reached}
            onClick={() => onConcept(concept.tag)}
          >
            {concept.title}
          </button>
        ))}
      </div>
      <div className="playback-steps">
        {round(t("nav.back"), "⏮", "nav-back", info.selected <= info.first, onBack)}
        <div className="playback-marks" data-testid="nav-steps" aria-hidden>
          {marks.map((index) => (
            <span
              key={index}
              data-step={index}
              data-selected={index === info.selected || undefined}
              data-reached={index <= info.furthest || undefined}
              data-answered={info.answered.includes(index) || undefined}
              className="playback-mark"
            />
          ))}
        </div>
        {round(t("nav.forward"), "⏭", "nav-forward", info.selected >= info.furthest, onForward)}
      </div>
      <div className="playback-actions">
        <button type="button" className="playback-listen wb-tap" data-testid="nav-listen" onClick={onListen}>
          {t("nav.listen")}
        </button>
        <button type="button" className="playback-resume wb-tap" data-testid="nav-resume" onClick={onResume}>
          {t("edge.paused.resume")}
        </button>
      </div>
    </aside>
  );
}
