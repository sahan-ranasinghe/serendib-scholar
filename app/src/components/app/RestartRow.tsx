"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enterLessonDisplay } from "./StartLessonButton";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import { postJson } from "@/lib/clientSession";

/** A completed session's own "මුල ඉඳන් ආයෙත්" (confirm once): its rows go, mastery stays, the lesson replays it. */
export function RestartRow({ lesson, session }: { lesson: number; session: number }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const restart = async () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    const r = await postJson("/api/session/restart", { lesson, session });
    if (r.ok) {
      await enterLessonDisplay();
      router.push("/session");
    } else setBusy(false);
  };
  const css = `height:48px;padding:0 14px;border:2px solid ${confirm ? "var(--color-coral)" : "var(--color-ink-18)"};border-radius:12px;background:var(--color-paper);color:${confirm ? "var(--color-coral-text)" : "var(--color-teal)"};font:700 20px/1.5 var(--font-display)`;
  return (
    <div style={sx("width:100%;display:flex;gap:8px;justify-content:flex-end")} data-testid="restart-row" data-session={session}>
      <button type="button" onClick={() => void restart()} disabled={busy} data-busy={busy || undefined} data-testid={confirm ? "restart-confirm" : "restart-session"} style={sx(css)}>
        {busy ? t("app.resetting") : t("detail.restart")}
      </button>
      {confirm && (
        <button type="button" onClick={() => setConfirm(false)} data-testid="restart-cancel" style={sx("height:48px;padding:0 14px;border:2px solid var(--color-ink-18);border-radius:12px;background:var(--color-paper);color:var(--color-ink-70);font:700 20px/1.5 var(--font-display)")}>
          {t("onb.4.skip")}
        </button>
      )}
    </div>
  );
}
