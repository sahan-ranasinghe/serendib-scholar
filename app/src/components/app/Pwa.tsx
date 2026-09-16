"use client";

import { useEffect } from "react";

/**
 * Installability: registers the service worker (production only — a dev
 * server's chunks change under it) and keeps the browser's
 * `beforeinstallprompt` so the install card can show it later, after a
 * completed session (see InstallPrompt). Never on first open: the splash
 * counts opens.
 */
declare global {
  interface Window {
    __installPrompt?: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null;
  }
}

export function Pwa({ sha }: { sha?: string }) {
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      window.__installPrompt = event as unknown as Window["__installPrompt"];
      window.dispatchEvent(new Event("ss:installable"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      // The build's SHA is in the worker's URL: a new build is a new worker,
      // which installs, skips waiting and claims this page — and the banner
      // (UpdateBanner) offers the reload.
      const url = sha ? `/sw.js?v=${encodeURIComponent(sha)}` : "/sw.js";
      navigator.serviceWorker
        .register(url, { scope: "/" })
        .then((registration) => registration.update().catch(() => undefined))
        .catch((error) => console.warn("[pwa] service worker registration failed:", error));
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [sha]);
  return null;
}
