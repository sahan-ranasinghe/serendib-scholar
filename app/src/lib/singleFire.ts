/**
 * ONE TAP, ONE ACTION — the shared single-fire guard (23 Sep 2026).
 *
 * The number pad lost "1000" to a double-click handler, and the playback
 * panel's ⏮ played a beat twice: a single tap on a phone can reach a
 * control as more than one activation (a touch and its compatibility click,
 * a double-tap gesture, a second click on a control that was just
 * re-rendered under the finger). This module decides, for every click on
 * every control in the app, whether it is a real press. It is installed
 * once, at the root (src/components/app/SingleFire.tsx), in the capture
 * phase — so no control can opt out by forgetting, and a new control is
 * covered the day it is written.
 *
 * The rules:
 *   - A pointer click counts only if its own pointerdown landed on the same
 *     control. A click with no press behind it (a ghost click, a replay) is
 *     dropped.
 *   - A control does not fire twice within SINGLE_FIRE_MS (300 ms). A rapid
 *     double-tap on ⏮ is one step back.
 *   - EXCEPT a control marked `data-tap-repeat`: a pad key, ⌫, a rod that
 *     takes a bead off, a row that gives a digit back. Two quick taps there
 *     are two presses (the two 0s of 1000 at 150 ms), so the rule is one
 *     activation per pointerdown — never a time window.
 *   - A click with no pointer at all (a keyboard press, `el.click()`) has no
 *     pointerdown to pair with; it passes on the time rule alone (a repeat
 *     control needs only REPEAT_FLOOR_MS between two).
 *   - dblclick never reaches a control; contextmenu (the long-press menu)
 *     is refused on controls. touch-action: manipulation on every control
 *     is in globals.css.
 *   - A SURFACE that acts on the touch itself (`data-tap-press`: the board
 *     during a soft check, "tap anywhere to continue") never gets a click to
 *     guard — it answers on pointerdown, for speed. The guard meets it
 *     there: one press per SINGLE_FIRE_MS, the second of a fast double tap
 *     stopped before the app sees it (28 Sep 2026: it could land on the next
 *     soft check and skip it).
 */

export const SINGLE_FIRE_MS = 300;
/** Two presses of a repeat control closer than this with no pointer are one press delivered twice. */
export const REPEAT_FLOOR_MS = 30;

/** What the guard remembers about one control. */
export interface FireState {
  /** When it last fired (event timeStamp, ms), or -Infinity. */
  lastFire: number;
  /** A pointerdown has landed on it since it last fired. */
  armed: boolean;
}

export const FRESH: FireState = { lastFire: Number.NEGATIVE_INFINITY, armed: false };

/** A pointerdown on the control. */
export function onPress(state: FireState = FRESH): FireState {
  return { ...state, armed: true };
}

/**
 * A click on the control: is it a real activation?
 * `pointer` is whether the click came from a pointer (MouseEvent.detail > 0); `repeat` is the control's data-tap-repeat.
 */
export function onActivate(state: FireState = FRESH, click: { at: number; pointer: boolean; repeat: boolean }): { accept: boolean; next: FireState } {
  const since = click.at - state.lastFire;
  let accept: boolean;
  if (click.pointer) {
    // A pointer click needs its own press; a non-repeat control also needs the window to have passed.
    accept = state.armed && (click.repeat || since >= SINGLE_FIRE_MS);
  } else {
    accept = since >= (click.repeat ? REPEAT_FLOOR_MS : SINGLE_FIRE_MS);
  }
  // The press is consumed either way: a second click riding on the same pointerdown is never accepted.
  return { accept, next: accept ? { lastFire: click.at, armed: false } : { ...state, armed: false } };
}

/**
 * A press on a surface that acts on pointerdown (`data-tap-press`): is it a real one? The press IS the activation, so only
 * the time rule applies — there is no click to pair it with.
 */
export function onSurfacePress(state: FireState = FRESH, at: number): { accept: boolean; next: FireState } {
  const accept = at - state.lastFire >= SINGLE_FIRE_MS;
  return { accept, next: accept ? { lastFire: at, armed: false } : state };
}

/** A surface that acts on the touch itself, not on a click (see onSurfacePress). */
export const PRESS_SURFACE_SELECTOR = "[data-tap-press]";

/** What counts as a control: the same list the dead-control crawler clicks (scripts/crawl-check.ts). */
export const CONTROL_SELECTOR = 'a[href], button, [role="button"], input[type="submit"], [role="tab"], summary, [data-tap]';

/** Refused activations, for the harness (window.__singleFire). */
export interface SingleFireLog {
  accepted: number;
  refused: Array<{ control: string; why: "no-press" | "too-soon"; at: number }>;
}

/**
 * Installs the guard on `target` (the window). Returns the uninstaller. Browser only.
 */
export function installSingleFire(target: Window): () => void {
  const states = new WeakMap<Element, FireState>();
  const log: SingleFireLog = { accepted: 0, refused: [] };
  (target as unknown as { __singleFire?: SingleFireLog }).__singleFire = log;
  const controlOf = (event: Event): Element | null => {
    const node = event.target as { closest?: (selector: string) => Element | null } | null;
    return typeof node?.closest === "function" ? node.closest(CONTROL_SELECTOR) : null;
  };
  const describe = (el: Element) => el.getAttribute("data-testid") || el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 24) || el.tagName.toLowerCase();

  const onPointerDown = (event: PointerEvent) => {
    const node = event.target as { closest?: (selector: string) => Element | null } | null;
    const surface = typeof node?.closest === "function" ? node.closest(PRESS_SURFACE_SELECTOR) : null;
    if (surface) {
      const { accept, next } = onSurfacePress(states.get(surface), event.timeStamp);
      states.set(surface, next);
      if (!accept) {
        log.refused.push({ control: describe(surface), why: "too-soon", at: Math.round(event.timeStamp) });
        if (log.refused.length > 50) log.refused.shift();
        event.stopImmediatePropagation();
        return;
      }
      log.accepted += 1;
    }
    const control = controlOf(event);
    if (control) states.set(control, onPress(states.get(control)));
  };
  const onClick = (event: MouseEvent) => {
    const control = controlOf(event);
    if (!control) return;
    const repeat = control.hasAttribute("data-tap-repeat");
    const before = states.get(control);
    const { accept, next } = onActivate(before, { at: event.timeStamp, pointer: event.detail > 0, repeat });
    states.set(control, next);
    if (accept) {
      log.accepted += 1;
      return;
    }
    const why = event.detail > 0 && !before?.armed ? "no-press" : "too-soon";
    log.refused.push({ control: describe(control), why, at: Math.round(event.timeStamp) });
    if (log.refused.length > 50) log.refused.shift();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onDoubleClick = (event: MouseEvent) => {
    if (!controlOf(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onContextMenu = (event: MouseEvent) => {
    if (controlOf(event)) event.preventDefault();
  };
  target.addEventListener("pointerdown", onPointerDown, { capture: true });
  target.addEventListener("click", onClick, { capture: true });
  target.addEventListener("dblclick", onDoubleClick, { capture: true });
  target.addEventListener("contextmenu", onContextMenu, { capture: true });
  return () => {
    target.removeEventListener("pointerdown", onPointerDown, { capture: true });
    target.removeEventListener("click", onClick, { capture: true });
    target.removeEventListener("dblclick", onDoubleClick, { capture: true });
    target.removeEventListener("contextmenu", onContextMenu, { capture: true });
  };
}
