"use client";

/**
 * Pointer-event drag for the touch primitives — one finger or a mouse,
 * no long-press, no double-tap. The element captures the pointer on
 * down; `onMove` gets every move; `onEnd` gets the final point and
 * whether the pointer actually travelled (a tap is a drag that did not
 * move, and stays a tap).
 */
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

export interface DragPoint {
  x: number;
  y: number;
}

export interface DragHandlers<T> {
  onStart?: (item: T, point: DragPoint) => void;
  onMove?: (item: T, point: DragPoint) => void;
  onEnd?: (item: T, point: DragPoint, moved: boolean) => void;
}

const TAP_SLOP_PX = 6;

export function useDrag<T>(handlers: DragHandlers<T>) {
  const live = useRef(handlers);
  useEffect(() => {
    live.current = handlers;
  });
  const start = useRef<DragPoint | null>(null);
  const moved = useRef(false);

  return useCallback(
    (item: T) => ({
      onPointerDown: (event: ReactPointerEvent<Element>) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, y: event.clientY };
        moved.current = false;
        live.current.onStart?.(item, start.current);
      },
      onPointerMove: (event: ReactPointerEvent<Element>) => {
        if (!start.current) return;
        const point = { x: event.clientX, y: event.clientY };
        if (Math.hypot(point.x - start.current.x, point.y - start.current.y) > TAP_SLOP_PX) moved.current = true;
        live.current.onMove?.(item, point);
      },
      onPointerUp: (event: ReactPointerEvent<Element>) => {
        if (!start.current) return;
        start.current = null;
        live.current.onEnd?.(item, { x: event.clientX, y: event.clientY }, moved.current);
      },
      onPointerCancel: (event: ReactPointerEvent<Element>) => {
        if (!start.current) return;
        start.current = null;
        live.current.onEnd?.(item, { x: event.clientX, y: event.clientY }, true);
      },
    }),
    [],
  );
}

/** The element under a point that carries `attribute`, and that attribute's value. */
export function hitTest(point: DragPoint, attribute: string): { element: HTMLElement; value: string } | null {
  const stack = typeof document === "undefined" ? [] : document.elementsFromPoint(point.x, point.y);
  for (const element of stack) {
    const hit = element.closest<HTMLElement>(`[${attribute}]`);
    if (hit) return { element: hit, value: hit.getAttribute(attribute) ?? "" };
  }
  return null;
}
