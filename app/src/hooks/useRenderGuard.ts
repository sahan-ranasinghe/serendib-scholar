"use client";

/**
 * A dev-only tripwire for render loops.
 *
 * The portal flickered continuously on every device because the recorder
 * hook called setState three times per animation frame — sixty renders a
 * second of the whole page, including the line the actor is trying to
 * read. It was invisible in code review and obvious the moment anything
 * counted renders, so something counts them now.
 *
 * Counted in an effect with NO dependency array, which runs once per
 * commit. That is the right unit: a commit is what repaints, and a repaint
 * is what she sees flicker. (Counting during render instead would be
 * impure — an effect is the sanctioned place for a clock and a mutation.)
 *
 * Compiled out of production; in dev it warns at most once a second while
 * a component is over budget.
 */
import { useEffect, useRef } from "react";

/** Above this many commits per second, something is looping, not updating. */
export const RENDER_BUDGET_PER_SECOND = 10;

export function useRenderGuard(name: string): void {
  const tracker = useRef({ count: 0, windowStart: 0, lastWarn: 0, announced: false });

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const state = tracker.current;
    if (!state.announced) {
      state.announced = true;
      console.debug(`[render-guard] watching <${name}>`);
    }
    const now = performance.now();
    if (now - state.windowStart > 1000) {
      state.windowStart = now;
      state.count = 0;
    }
    state.count += 1;
    if (state.count > RENDER_BUDGET_PER_SECOND && now - state.lastWarn > 1000) {
      state.lastWarn = now;
      console.warn(
        `[render-guard] <${name}> rendered ${state.count}x in the last second ` +
          `(budget ${RENDER_BUDGET_PER_SECOND}). Something is setting state on a timer or an ` +
          `animation frame — move it to a ref and write the DOM directly.`,
      );
    }
  });
}
