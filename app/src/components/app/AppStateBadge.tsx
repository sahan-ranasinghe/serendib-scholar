"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/appStore";
import { t } from "@/lib/appCopy";

/**
 * The quiet indicator (cluster H): "updating" while a fetch runs behind
 * cached data, "no connection — showing the last copy" when the network is
 * gone. Never a spinner over the screen, never a blank.
 */
/** Every app route (the ones with no visible link included): prefetched once the app is up, so any tap is a warm transition. */
const APP_ROUTES = ["/home", "/lessons", "/lessons/1", "/practice", "/rewards", "/rewards/certificate", "/progress", "/session/summary", "/parent", "/parent/settings", "/parent/pin", "/parent/profiles", "/parent/report", "/parent/subscription", "/parent/delete"];

export function AppStateBadge() {
  const { status, updating, snapshot } = useAppState();
  const router = useRouter();
  useEffect(() => {
    // Prefetched when the main thread is idle, one route at a time: a warm cache for the child's next tap without a
    // burst of fetches competing with the tap they are making now.
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const idle = (fn: () => void) => ("requestIdleCallback" in window ? (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback(fn, { timeout: 4000 }) : timers.push(setTimeout(fn, 2500)));
    idle(() => {
      APP_ROUTES.forEach((route, i) => {
        timers.push(setTimeout(() => { if (!cancelled) router.prefetch(route); }, 300 * i));
      });
    });
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
  }, [router]);
  const offline = status === "offline";
  if (!offline && !(updating && snapshot && status === "cached")) return null;
  return (
    <div data-testid="app-state-badge" data-state={offline ? "offline" : "updating"} style={{ position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 60, pointerEvents: "none", background: offline ? "rgba(27,27,27,.82)" : "rgba(15,76,92,.82)", color: "#fff", borderRadius: 999, padding: "4px 12px", font: "600 14px/1.4 var(--font-label)", whiteSpace: "nowrap" }}>
      {offline ? t("app.offlineCached") : t("app.updating")}
    </div>
  );
}
