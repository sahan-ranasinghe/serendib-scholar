"use client";

/**
 * How the pointer and the highlight find things.
 *
 * Every primitive registers the things a line can point at — a rod, a
 * card, one digit of a number, a chalk span — under the vocabulary's
 * target keys, with the Whiteboard holding the registry. `Pointer` and
 * `Highlight` resolve a Target to an element, measure it against the
 * board surface, and draw there. A target nothing has registered
 * resolves to null and the pointer hides rather than pointing at the
 * wrong thing.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Target } from "./events";

export type { Target };

export function targetKey(target: Target): string {
  if ("number" in target) return `number:${target.number}`;
  if ("rod" in target) return `rod:${target.rod}`;
  if ("column" in target) return `column:${target.column}`;
  if ("card" in target) return target.place ? `card:${target.card}/place:${target.place}` : `card:${target.card}`;
  if ("cell" in target) return `cell:${target.cell.row}/${target.cell.field}`;
  if ("part" in target) return `part:${target.part}`;
  if ("digit" in target) return `digit:${target.digit}`;
  return target.place ? `text:${target.text}/place:${target.place}` : `text:${target.text}`;
}

/**
 * Keys tried, in order, for one target. A `{number:84}` is found on a card
 * before a chalk span; the storyboard's `{text:"abacus"}` means the whole
 * component, which registers itself under `component:abacus` as well.
 */
export function candidateKeys(target: Target): string[] {
  const primary = targetKey(target);
  if ("number" in target) {
    const raw = String(target.number);
    return [primary, `card:${target.number}`, `text:${raw}`, `text:${raw.replace(/\B(?=(\d{3})+(?!\d))/gu, " ")}`];
  }
  if ("text" in target && !target.place) return [primary, `component:${target.text}`];
  return [primary];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardRegistry {
  register: (keys: string[], element: Element) => () => void;
  resolve: (target: Target) => Element | null;
  /** A rect in the surface's own (unscaled) coordinate space. */
  measure: (element: Element) => Rect | null;
  surface: HTMLElement | null;
  /** Where Pointer, Highlight and FeedbackFX draw — a layer above the content. */
  overlay: HTMLElement | null;
  /** The dock at the foot of the board (a number pad, a word bank) — docked inputs render into it. */
  dock: HTMLElement | null;
  /** A docked input announces itself (+1 on mount, −1 on unmount) so the content inset makes room (bottom 190). */
  noteDock: (delta: number) => void;
  /** Bumped whenever something registers, so overlays re-measure. */
  version: number;
}

export const BoardContext = createContext<BoardRegistry | null>(null);

const NO_BOARD: BoardRegistry = {
  register: () => () => {},
  resolve: () => null,
  measure: () => null,
  surface: null,
  overlay: null,
  dock: null,
  noteDock: () => {},
  version: 0,
};

/** The board this primitive sits on — a no-op registry outside a Whiteboard. */
export function useBoard(): BoardRegistry {
  return useContext(BoardContext) ?? NO_BOARD;
}

/** The registry a Whiteboard provides. */
export function useBoardRegistry(surface: HTMLElement | null, overlay: HTMLElement | null, dock: HTMLElement | null = null, noteDock: (delta: number) => void = () => {}, layout = 0): BoardRegistry {
  const entries = useRef(new Map<string, Element[]>());
  const [version, setVersion] = useState(0);
  const register = useCallback((keys: string[], element: Element) => {
    for (const key of keys) entries.current.set(key, [...(entries.current.get(key) ?? []), element]);
    // Visible to QA (board-check) and the inspector: what this element answers to.
    element.setAttribute("data-targets", keys.join("|"));
    setVersion((v) => v + 1);
    return () => {
      for (const key of keys) {
        const remaining = (entries.current.get(key) ?? []).filter((e) => e !== element);
        if (remaining.length) entries.current.set(key, remaining);
        else entries.current.delete(key);
      }
      element.removeAttribute("data-targets");
      setVersion((v) => v + 1);
    };
  }, []);
  const resolve = useCallback((target: Target) => {
    for (const key of candidateKeys(target)) {
      const found = entries.current.get(key);
      // The most recently registered wins: the thing that just appeared
      // is the thing she is talking about.
      if (found?.length) return found[found.length - 1]!;
    }
    return null;
  }, []);
  const measure = useCallback(
    (element: Element): Rect | null => {
      if (!surface) return null;
      const box = surface.getBoundingClientRect();
      const scale = surface.offsetWidth ? box.width / surface.offsetWidth : 1;
      const rect = element.getBoundingClientRect();
      return {
        x: (rect.left - box.left) / scale,
        y: (rect.top - box.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      };
    },
    [surface],
  );
  return useMemo(
    // `layout` (the dock opening or closing) moves everything on the surface: overlays re-measure as if something had registered.
    () => ({ register, resolve, measure, surface, overlay, dock, noteDock, version: version + layout * 100000 }),
    [register, resolve, measure, surface, overlay, dock, noteDock, version, layout],
  );
}

/** Keys are joined for the dependency list with a character no key contains. */
const KEY_SEPARATOR = "\n";

/** A callback ref that registers its element under one or more target keys. */
export function useTargetRef<T extends Element = HTMLElement>(keys: string | string[] | null): (element: T | null) => void {
  const board = useBoard();
  const unregister = useRef<() => void>(() => {});
  const list = Array.isArray(keys) ? keys : keys ? [keys] : [];
  const joined = list.join(KEY_SEPARATOR);
  return useCallback(
    (element: T | null) => {
      unregister.current();
      unregister.current = () => {};
      if (element && joined) unregister.current = board.register(joined.split(KEY_SEPARATOR), element);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.register, joined],
  );
}

/**
 * The surface-relative rect of a target, kept fresh: re-measured when
 * anything registers, on resize, and again shortly after — because the
 * thing pointed at is usually still animating in when the pointer moves.
 */
export function useTargetRect(target: Target | null, settleMs = 650): Rect | null {
  const board = useBoard();
  // The rect is stored WITH the key it was measured for. A new target
  // starts from nothing — a highlight must never mount at the previous
  // target's place and slide over later.
  const [measured, setMeasured] = useState<{ key: string; rect: Rect } | null>(null);
  const key = target ? targetKey(target) : null;
  useEffect(() => {
    if (!target || !key) return;
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      const element = board.resolve(target);
      const rect = element ? board.measure(element) : null;
      setMeasured(rect ? { key, rect } : null);
    };
    // Measured after paint: the target is usually mid-animation when the
    // pointer is told to move, and again once it has settled.
    const first = requestAnimationFrame(update);
    const again = setTimeout(update, settleMs);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (board.surface && observer) observer.observe(board.surface);
    window.addEventListener("resize", update);
    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      clearTimeout(again);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
    // `key` stands in for `target` (a fresh object each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, board.version, board.surface, settleMs]);
  return key && measured?.key === key ? measured.rect : null;
}
