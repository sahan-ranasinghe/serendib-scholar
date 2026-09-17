"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PrimaryButton, SecondaryButton } from "./Screen";
import { enterLessonDisplay } from "./StartLessonButton";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import { postJson } from "@/lib/clientSession";

/**
 * The lesson detail's CTA when the current session has rows behind it (in
 * progress or complete): "ඉතුරු ටික කරමු" resumes (the runtime picks the
 * first unfinished session) and "මුල ඉඳන් ආයෙත්" restarts it after one
 * confirmation — that session's session_log rows go, mastery stays.
 */
export function SessionActions({ lesson, session, label }: { lesson: number; /** 0-based packed session index. */ session: number; label: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const go = async () => {
    await enterLessonDisplay();
    router.push("/session");
  };
  const restart = async () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    const r = await postJson<{ ok: boolean; first_beat?: string }>("/api/session/restart", { lesson, session });
    if (!r.ok) {
      setError(true);
      setBusy(false);
      return;
    }
    await go();
  };
  return (
    <div style={sx("display:grid;gap:10px")} data-testid="session-actions" data-session={session}>
      <PrimaryButton height={60} onClick={() => void go()} testId="resume-session">
        {t("detail.resume")}
      </PrimaryButton>
      <div style={sx("display:flex;gap:10px")}>
        <SecondaryButton height={48} onClick={() => void restart()} testId={confirm ? "restart-confirm" : "restart-session"} style={{ flex: 1, opacity: busy ? 0.6 : 1, borderColor: confirm ? "var(--color-coral)" : undefined, color: confirm ? "var(--color-coral-text)" : undefined }}>
          {busy ? t("app.resetting") : t("detail.restart")}
        </SecondaryButton>
        {confirm && (
          <SecondaryButton height={48} onClick={() => setConfirm(false)} testId="restart-cancel" style={{ flex: 1 }} font="700 20px/1.5 var(--font-display)">
            {t("onb.4.skip")}
          </SecondaryButton>
        )}
      </div>
      {error && <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-coral-text)")}>{t("session.connectFail")}</span>}
      <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70);text-align:center")}>{label}</span>
    </div>
  );
}
