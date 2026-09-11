import type { CSSProperties } from "react";

/**
 * The design export writes every style inline (`style="font:700 28px/1.5
 * var(--font-display);color:var(--color-ink)"`). The app screens copy those
 * strings verbatim — "copy, don't reinterpret" — and this turns one into a
 * React style object. Shorthands (font, background, border, padding…) are
 * passed through untouched, exactly as the export declares them.
 */
const cache = new Map<string, CSSProperties>();

export function sx(declarations: string, extra?: CSSProperties): CSSProperties {
  let parsed = cache.get(declarations);
  if (!parsed) {
    parsed = {};
    for (const part of declarations.split(";")) {
      const colon = part.indexOf(":");
      if (colon <= 0) continue;
      const prop = part.slice(0, colon).trim();
      const value = part.slice(colon + 1).trim();
      if (!prop) continue;
      const key = prop.startsWith("--") ? prop : prop.replace(/-([a-z])/gu, (_, c: string) => c.toUpperCase());
      (parsed as Record<string, string>)[key] = value;
    }
    cache.set(declarations, parsed);
  }
  return extra ? { ...parsed, ...extra } : parsed;
}
