"use client";

import { useLang } from "@/lib/useLang";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Screen } from "./Screen";
import { ParentHeader } from "./screens/ParentZone";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import { postJson } from "@/lib/clientSession";
import { useAppState } from "@/lib/appStore";

const PIN_LABEL = "font:600 18px/1.5 var(--font-label);color:var(--color-ink-70)";

/**
 * Four 64 px boxes for a PIN. One real numeric input lies over the row (so
 * the phone's number keypad, paste and backspace all behave natively); the
 * boxes draw what it holds. The box the next digit lands in carries a
 * blinking caret while the field has focus, and moves on as each digit is
 * typed; `reveal` shows the digits instead of dots; `onComplete` fires on
 * the fourth digit so a form can move focus to its next field.
 */
export function PinBoxes({ value, onChange, active, testId, reveal = false, invalid = false, inputRef, onComplete, label = "PIN" }: { value: string; onChange: (v: string) => void; active: boolean; testId?: string; reveal?: boolean; invalid?: boolean; inputRef?: RefObject<HTMLInputElement | null>; onComplete?: () => void; label?: string }) {
  const own = useRef<HTMLInputElement | null>(null);
  const ref = inputRef ?? own;
  const [focused, setFocused] = useState(false);
  const digits = [0, 1, 2, 3].map((i) => value[i] ?? "");
  // The caret sits in the next empty box — or stays in the last one when all four are in.
  const caretAt = Math.min(value.length, 3);
  return (
    <div style={sx("display:grid;grid-template-columns:repeat(4,1fr);gap:10px;position:relative")} data-testid={testId} data-focused={focused || undefined} data-filled={value.length} data-invalid={invalid || undefined}>
      {digits.map((d, i) => {
        const here = focused && i === caretAt;
        const border = invalid ? "var(--color-coral)" : here ? "#0F4C5C" : "rgba(27,27,27,.18)";
        return (
          <div key={i} data-pin-box={i} data-caret={here || undefined} style={sx(`height:64px;border:${here ? 3 : 2}px solid ${border};border-radius:14px;background:${d ? "#EEF4F5" : "#fff"};display:flex;align-items:center;justify-content:center;gap:2px;font:700 28px/1 var(--font-latin);color:var(--color-ink);box-sizing:border-box`)}>
            {d ? <span data-pin-digit>{reveal ? d : "•"}</span> : null}
            {here && <span className="pin-caret" data-testid="pin-caret" aria-hidden />}
          </div>
        );
      })}
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={4}
        autoFocus={active}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/gu, "").slice(0, 4);
          onChange(next);
          if (next.length === 4 && value.length < 4) onComplete?.();
        }}
        aria-label={label}
        aria-invalid={invalid || undefined}
        style={sx("position:absolute;inset:0;opacity:0;width:100%;height:100%;font-size:24px;caret-color:transparent")}
      />
    </div>
  );
}

/** The eye: shows the digits, or hides them behind dots again. 56 px, so a thumb finds it. */
export function PinEye({ reveal, onToggle }: { reveal: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={reveal} aria-label={t(reveal ? "pin.hide" : "pin.show")} title={t(reveal ? "pin.hide" : "pin.show")} data-testid="pin-eye" style={sx("width:56px;height:56px;border:0;border-radius:50%;background:transparent;display:flex;align-items:center;justify-content:center;color:var(--color-teal);flex:none")}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {!reveal && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}

/**
 * The parent zone's gate: the PIN, once. (Setting a PIN — new, then again —
 * is PinChangeClient's job; the gate only ever verifies.)
 */
export function PinGate({ pinSet }: { pinSet: boolean }) {
  useLang();
  const { refresh } = useAppState();
  const [pin, setPin] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const submit = async (entered = pin) => {
    if (entered.length !== 4 || busy) return;
    setBusy(true);
    const r = await postJson<{ ok: boolean; error?: string }>("/api/parent/enter", { pin: entered });
    if (r.ok) {
      // Stay busy until the snapshot that carries the parent zone is in: the gate never shows itself empty a second time.
      await refresh();
      setBusy(false);
      return;
    }
    setBusy(false);
    setError(r.status === 401 && r.json?.error === "wrong_pin" ? t("parent.pinWrong") : t("session.connectFail"));
    setPin("");
    input.current?.focus();
  };
  useEffect(() => {
    input.current?.focus();
  }, []);
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
        <div style={sx("display:flex;align-items:center;justify-content:space-between")}>
          <span style={sx(PIN_LABEL)} data-testid="pin-gate-label">{pinSet ? t("pin.enter") : t("pin.create")}</span>
          <PinEye reveal={reveal} onToggle={() => setReveal((v) => !v)} />
        </div>
        <PinBoxes
          value={pin}
          onChange={(v) => {
            setPin(v);
            if (error) setError(null);
          }}
          active
          reveal={reveal}
          invalid={Boolean(error)}
          inputRef={input}
          testId="pin-boxes"
          label={t("pin.label")}
        />
        {error && <span role="alert" style={sx("font:600 18px/1.5 var(--font-body);color:var(--color-coral-text)")} data-testid="pin-error">{error}</span>}
        <button type="submit" disabled={pin.length !== 4 || busy} data-busy={busy || undefined} data-testid="pin-submit" style={sx("height:56px;border:0;border-radius:12px;background:var(--color-teal);color:#fff;font:700 24px/1.5 var(--font-display);box-shadow:var(--shadow-button)", { opacity: pin.length === 4 ? 1 : 0.45 })}>
          {busy ? t("app.checking") : t("onb.next")}
        </button>
      </form>
    </Screen>
  );
}
