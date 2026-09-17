"use client";

import { useLang } from "@/lib/useLang";
import { useState } from "react";
import { Screen } from "./Screen";
import { ParentHeader } from "./screens/ParentZone";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import { postJson } from "@/lib/clientSession";
import { useAppState } from "@/lib/appStore";

/** Four 56 px boxes for a PIN (the onboarding OTP boxes' look). */
export function PinBoxes({ value, onChange, active, testId }: { value: string; onChange: (v: string) => void; active: boolean; testId?: string }) {
  const digits = [0, 1, 2, 3].map((i) => value[i] ?? "");
  return (
    <div style={sx("display:grid;grid-template-columns:repeat(4,1fr);gap:8px;position:relative")} data-testid={testId}>
      {digits.map((d, i) => (
        <div key={i} style={sx(`height:56px;border:2px solid ${active && i === value.length ? "#0F4C5C" : "rgba(27,27,27,.18)"};border-radius:12px;background:${d ? "#EEF4F5" : "#fff"};display:flex;align-items:center;justify-content:center;font:600 24px/1 var(--font-latin);color:var(--color-ink)`)}>
          {d ? "•" : ""}
        </div>
      ))}
      <input inputMode="numeric" pattern="[0-9]*" maxLength={4} autoFocus={active} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/gu, "").slice(0, 4))} aria-label="PIN" style={sx("position:absolute;inset:0;opacity:0;width:100%;height:100%;font-size:24px")} />
    </div>
  );
}

/**
 * The parent zone's gate. With no PIN set yet the first entry creates it
 * (the export has no "create a PIN" line — see MISSING in appCopy.ts — so
 * the gate shows only the label PIN and the step's next button).
 */
export function PinGate({ pinSet }: { pinSet: boolean }) {
  useLang();
  const { refresh } = useAppState();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pin.length !== 4 || busy) return;
    setBusy(true);
    const r = await postJson<{ ok: boolean; error?: string }>("/api/parent/enter", { pin });
    setBusy(false);
    if (r.ok) {
      await refresh();
      return;
    }
    setError(r.status === 401 && r.json?.error === "wrong_pin" ? t("parent.pinWrong") : t("session.connectFail"));
    setPin("");
  };
  return (
    <Screen label="Parent PIN" root="background:#FFFDF8;display:flex;flex-direction:column;padding:0 20px">
      <ParentHeader title={t("parent.title")} sub={pinSet ? t("parent.pinSet") : undefined} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={sx("display:grid;gap:14px;margin-top:24px")}
        data-testid="pin-gate"
        data-mode={pinSet ? "verify" : "create"}
      >
        <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-ink-70)")}>PIN</span>
        <PinBoxes value={pin} onChange={setPin} active testId="pin-boxes" />
        {error && <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-coral-text)")} data-testid="pin-error">{error}</span>}
        <button type="submit" disabled={pin.length !== 4 || busy} data-busy={busy || undefined} data-testid="pin-submit" style={sx("height:56px;border:0;border-radius:12px;background:var(--color-teal);color:#fff;font:700 24px/1.5 var(--font-display);box-shadow:var(--shadow-button)", { opacity: pin.length === 4 ? 1 : 0.45 })}>
          {busy ? t("app.checking") : t("onb.next")}
        </button>
      </form>
    </Screen>
  );
}
