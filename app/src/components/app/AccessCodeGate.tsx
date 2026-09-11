"use client";

import { useState } from "react";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import { ensureSession, type SessionStartInfo } from "@/lib/clientSession";

/**
 * The device gate outside the session: the same access-code entry the
 * lesson shows (see LessonScreen), for pages that call the API before a
 * lesson has ever run on this device.
 */
export function AccessCodeGate({ wrong, onUnlocked }: { wrong: boolean; onUnlocked: (info: SessionStartInfo) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(wrong ? t("parent.pinWrong") : null);
  return (
    <div data-testid="access-gate" style={sx("position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(27,27,27,.38);padding:24px")}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!code.trim()) return;
          void ensureSession(code).then((r) => {
            if (r.status === "ok") onUnlocked(r.info);
            else setError(r.status === "locked" ? t("parent.pinWrong") : t("session.connectFail"));
          });
        }}
        style={sx("display:grid;gap:12px;justify-items:center;background:var(--color-paper);border-radius:16px;padding:16px 20px;box-shadow:var(--shadow-lift)")}
      >
        <p style={sx("margin:0;font:700 26px/1.4 var(--font-display);color:var(--color-ink)")}>{t("gate.title")}</p>
        <p style={sx("margin:0;font:400 20px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("gate.sub")}</p>
        <div style={sx("display:flex;gap:10px;align-items:center")}>
          <input type="password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} style={sx("width:176px;height:56px;border-radius:12px;border:2px solid var(--color-ink-18);background:#fff;padding:0 12px;text-align:center;font:700 22px/1 var(--font-latin);letter-spacing:0.2em;color:var(--color-ink)", { boxSizing: "border-box" })} />
          <button type="submit" style={sx("height:56px;padding:0 28px;border:0;border-radius:12px;background:var(--color-teal);color:#fff;font:700 24px/1.5 var(--font-display);box-shadow:var(--shadow-button)")}>
            {t("gate.enter")}
          </button>
        </div>
        {error && <p style={sx("margin:0;font:600 20px/1.5 var(--font-label);color:var(--color-coral-text)")}>{error}</p>}
      </form>
    </div>
  );
}
