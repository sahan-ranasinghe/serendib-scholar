"use client";

import { useState, useSyncExternalStore } from "react";
import ZaraCharacter from "@/components/ZaraCharacter";
import { HandNumber } from "@/components/board/HandNumber";
import { isStandalone } from "./StartLessonButton";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";

const DISMISSED_KEY = "ss:install-dismissed";

/**
 * "Add to home screen", after a completed session, with Zara explaining —
 * in the export's own words: the splash tagline (ඔයාගේම ගුරුතුමිය, ඔයාගේ
 * ෆෝන් එකේ) is the explanation; the full sentence is listed as MISSING in
 * appCopy.ts for the copy review. Dismissible; never on the first open;
 * never once installed; only when the browser has offered a prompt.
 */
function subscribeInstallable(onChange: () => void): () => void {
  window.addEventListener("ss:installable", onChange);
  return () => window.removeEventListener("ss:installable", onChange);
}

/** The browser has offered its prompt, this is not the first open, it was not dismissed, and the app is not already installed. */
function installOffered(): boolean {
  let opens = 0;
  let dismissed = false;
  try {
    opens = Number(localStorage.getItem("ss:opens") ?? "0");
    dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    /* private mode */
  }
  if (dismissed || opens < 2 || isStandalone()) return false;
  return Boolean(window.__installPrompt);
}

export function InstallPrompt({ force }: { force?: boolean }) {
  const offered = useSyncExternalStore(subscribeInstallable, installOffered, () => false);
  const [closed, setClosed] = useState(false);
  const open = !closed && (force || offered);
  if (!open) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* private mode */
    }
    setClosed(true);
  };
  const accept = async () => {
    const p = window.__installPrompt;
    if (p) {
      try {
        await p.prompt();
        await p.userChoice;
      } catch {
        /* dismissed */
      }
      window.__installPrompt = null;
    }
    setClosed(true);
  };
  return (
    <div data-testid="install-prompt" style={sx("width:100%;background:var(--color-paper);border:2px solid var(--color-ink-10);border-radius:20px;padding:14px 16px;display:grid;gap:10px;margin-top:14px;box-shadow:var(--shadow-paper)")}>
      <div style={sx("display:flex;align-items:flex-end;gap:12px")}>
        <ZaraCharacter state="talking" amplitude={0} mouth={2} portrait size={64} />
        <div style={sx("flex:1;background:var(--color-card);border-radius:16px 16px 16px 4px;padding:10px 14px;display:flex;align-items:center;gap:10px")}>
          <div style={sx("width:48px;height:36px;background:var(--color-board);border:4px solid var(--color-wood);border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 0 var(--color-wood-dark);flex:none")}>
            <HandNumber text="5" size={22} draw={false} registerNumbers={false} />
          </div>
          <div style={sx("display:grid")}>
            <span style={sx("font:700 22px/1.4 var(--font-display);color:var(--color-ink)")}>{t("brand.wordmarkSi")}</span>
            <span style={sx("font:400 20px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("splash.tagline")}</span>
          </div>
        </div>
      </div>
      <div style={sx("display:flex;gap:10px")}>
        <button type="button" onClick={() => void accept()} data-testid="install-accept" style={sx("flex:1;height:56px;border:0;border-radius:12px;background:var(--color-teal);color:#fff;font:700 24px/1.5 var(--font-display);box-shadow:var(--shadow-button)")}>
          {t("onb.3.cta")}
        </button>
        <button type="button" onClick={dismiss} data-testid="install-dismiss" style={sx("flex:1;height:56px;border:2px solid var(--color-ink-18);border-radius:12px;background:var(--color-paper);color:var(--color-teal);font:700 20px/1.5 var(--font-display)")}>
          {t("onb.4.skip")}
        </button>
      </div>
    </div>
  );
}
