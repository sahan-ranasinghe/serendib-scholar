"use client";

import { useSyncExternalStore } from "react";
import { getLang, serverLang, subscribeLang, type Lang } from "@/lib/langStore";

/** The current parent-zone language; re-renders the caller when the toggle changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, serverLang);
}
