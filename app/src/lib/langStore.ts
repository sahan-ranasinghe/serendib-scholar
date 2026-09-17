/**
 * The parent-facing language (cluster I): සිං | EN. The child's screens are
 * Sinhala only; the parent zone and onboarding carry the English column of
 * the copy sheet behind the header toggle. One module-level store, read by
 * t() on every render and subscribed to by the screens that show it, kept
 * on the device.
 */
export type Lang = "si" | "en";
const KEY = "ss:lang";

let current: Lang = "si";
let loaded = false;
const listeners = new Set<() => void>();

function load(): Lang {
  if (loaded || typeof window === "undefined") return current;
  loaded = true;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "si") current = saved;
  } catch {
    // storage unavailable: Sinhala
  }
  return current;
}

export function getLang(): Lang {
  return load();
}

export function setLang(lang: Lang): void {
  loaded = true;
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // storage unavailable: this visit only
  }
  for (const listener of listeners) listener();
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const serverLang = (): Lang => "si";
