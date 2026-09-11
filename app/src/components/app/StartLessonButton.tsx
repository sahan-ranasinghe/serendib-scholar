"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PrimaryButton } from "./Screen";
import { t } from "@/lib/appCopy";

/**
 * "පටන් ගමු" — the tap that enters a lesson. Being a user gesture it may
 * ask for fullscreen (so a landscape session keeps the whole screen) and,
 * when the app is installed, lock the orientation to landscape. Both are
 * best-effort: a refusal is swallowed and the session lays itself out
 * inside browser chrome as before.
 */
export function StartLessonButton({ height = 56, label, testId = "start-lesson", style }: { height?: 56 | 60; label?: string; testId?: string; style?: React.CSSProperties }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    await enterLessonDisplay();
    router.push("/session");
  };
  return (
    <PrimaryButton height={height} onClick={() => void start()} testId={testId} style={style}>
      {label ?? t("common.start")}
    </PrimaryButton>
  );
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** Fullscreen (any context) and a landscape lock (installed only). Silent on refusal. */
export async function enterLessonDisplay(): Promise<{ fullscreen: boolean; locked: boolean }> {
  let fullscreen = false;
  let locked = false;
  try {
    const root = document.documentElement as HTMLElement & { requestFullscreen?: (o?: { navigationUI?: "hide" | "show" | "auto" }) => Promise<void>; webkitRequestFullscreen?: () => Promise<void> };
    if (root.requestFullscreen && !document.fullscreenElement) {
      await root.requestFullscreen({ navigationUI: "hide" });
      fullscreen = true;
    } else if (root.webkitRequestFullscreen) {
      await root.webkitRequestFullscreen();
      fullscreen = true;
    }
  } catch {
    /* refused: the layout works inside browser chrome */
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (isStandalone() && orientation?.lock) {
      await orientation.lock("landscape");
      locked = true;
    }
  } catch {
    /* not available or refused */
  }
  (window as unknown as { __lessonDisplay?: unknown }).__lessonDisplay = { fullscreen, locked };
  return { fullscreen, locked };
}

/** On leaving a lesson: back out of fullscreen, back to portrait when installed. */
export async function leaveLessonDisplay(): Promise<void> {
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  } catch {
    /* nothing to leave */
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
    if (isStandalone() && orientation?.lock) await orientation.lock("portrait");
    else orientation?.unlock?.();
  } catch {
    /* not available */
  }
}
