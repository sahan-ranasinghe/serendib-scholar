"use client";

import { useEffect, useState } from "react";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";

/**
 * "A new version is here" — the answer to a phone quietly running a stale
 * service-worker cache. Two signals, either is enough:
 *
 *   · the service worker for a new build took over (controllerchange);
 *   · /api/build reports a different SHA from the one in this page's HTML
 *     (checked on load, when the tab comes back, and every 30 s).
 *
 * Tapping it reloads, which fetches the new HTML (navigations are
 * network-first in the worker) and lands on the new build.
 */
const POLL_MS = 30_000;

export function pageBuildSha(): string {
  if (typeof document === "undefined") return "";
  return document.querySelector('meta[name="ss-build"]')?.getAttribute("content") ?? "";
}

/** "1cead91 · 16 Sep 14:03" for this page's own build — the debug overlay's line. */
export function pageBuildStamp(): string {
  if (typeof document === "undefined") return "";
  const sha = pageBuildSha();
  const time = document.querySelector('meta[name="ss-build-time"]')?.getAttribute("content") ?? "";
  if (!time) return sha;
  const when = new Date(time);
  if (Number.isNaN(when.getTime())) return sha;
  return `${sha} · ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(when)}`;
}

export function UpdateBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const mine = pageBuildSha();
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch("/api/build", { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as { sha?: string };
        if (!cancelled && json.sha && mine && json.sha !== mine) setStale(true);
      } catch {
        /* offline: nothing to update to */
      }
    };
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    // A NEW worker claimed this page: the code on disk changed under it. The
    // first claim of a page that had no controller is just this app being
    // installed for the first time — not an update.
    let hadController = Boolean(navigator.serviceWorker?.controller);
    const onController = () => {
      if (hadController) setStale(true);
      hadController = true;
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onController);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("controllerchange", onController);
    };
  }, []);
  if (!stale) return null;
  return (
    <button
      type="button"
      data-testid="update-banner"
      onClick={() => window.location.reload()}
      style={sx("position:fixed;left:50%;top:8px;z-index:90;transform:translateX(-50%);height:44px;padding:0 18px;border:0;border-radius:999px;background:var(--color-teal);color:#fff;font:700 20px/1.5 var(--font-display);box-shadow:var(--shadow-lift);white-space:nowrap")}
    >
      {t("app.updateReady")}
    </button>
  );
}
