"use client";

import type { ReactNode } from "react";
import { t } from "@/lib/appCopy";

/**
 * A screen's skeleton IS the screen (cluster H): the real component drawn
 * with the design's sample data, greyed — so every card, row and ring is
 * already in its place and nothing shifts when the child's own data lands.
 * The bottom nav inside it stays live (a tap must always answer at once).
 */
export function Skeleton({ children, screen, line }: { children: ReactNode; screen: string; line?: string }) {
  return (
    <div className="app-skeleton" data-screen-skeleton={screen} aria-busy="true" style={{ position: "relative" }}>
      {children}
      {line && (
        <div data-testid="skeleton-line" style={{ position: "absolute", left: 20, right: 20, top: "44%", textAlign: "center", font: "600 18px/1.5 var(--font-label)", color: "var(--color-ink-70)", background: "rgba(247,243,234,.92)", borderRadius: 14, padding: "10px 14px", pointerEvents: "none" }}>
          {line}
        </div>
      )}
    </div>
  );
}

/** The line under a skeleton when there is no cached data at all (offline, first run). */
export function noDataLine(status: string): string | undefined {
  return status === "offline" || status === "error" ? t("app.noData") : undefined;
}
