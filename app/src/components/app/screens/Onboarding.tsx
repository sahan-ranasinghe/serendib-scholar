"use client";

import { useLang } from "@/lib/useLang";
import type { ReactNode } from "react";
import ZaraCharacter, { type ZaraState } from "@/components/ZaraCharacter";
import { ArtSlot, LangToggle, Screen } from "../Screen";
import { sx } from "../sx";
import { AVATARS, t } from "@/lib/appCopy";

/** Screens B's onboarding rows — step, Zara's state, her bubble, the title, the CTA. */
export const ONBOARDING_STEPS: Array<{ label: string; zara: ZaraState; bubble: string; title: string; cta: string; skip?: string }> = [
  { label: "Onboarding 1 · phone + OTP", zara: "talking", bubble: t("onb.1.bubble"), title: t("onb.1.title"), cta: t("onb.next") },
  { label: "Onboarding 2 · child profile", zara: "encourage", bubble: t("onb.2.bubble"), title: t("onb.2.title"), cta: t("onb.next") },
  { label: "Onboarding 3 · consent", zara: "idle", bubble: t("onb.3.bubble"), title: t("onb.3.title"), cta: t("onb.3.cta") },
  { label: "Onboarding 4 · subscription", zara: "celebrate", bubble: t("onb.4.bubble"), title: t("onb.4.title"), cta: t("onb.4.cta"), skip: t("onb.4.skip") },
];

const LABEL = "font:600 16px/1.5 var(--font-label);color:var(--color-ink-70)";

/** The onboarding frame shared by the four steps: paper-white, step counter, සිං|EN, dots, Zara + bubble, title, then the step's body and CTA. */
export function OnboardingScreen({ step, frame, children, cta, skip, lang, onLang }: { step: 1 | 2 | 3 | 4; frame?: boolean; children: ReactNode; cta: ReactNode; skip?: ReactNode; lang?: "si" | "en"; onLang?: (l: "si" | "en") => void }) {
  useLang();
  const o = ONBOARDING_STEPS[step - 1]!;
  return (
    <Screen label={o.label} frame={frame} root="background:#FFFDF8;display:flex;flex-direction:column;padding:0 24px">
      <div style={sx("padding-top:52px;display:flex;align-items:center;justify-content:space-between")}>
        <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-ink-70);white-space:nowrap")}>{t("onb.stepOf", { n: step })}</span>
        <LangToggle lang={lang} onChange={onLang} />
      </div>
      <div style={sx("display:flex;gap:6px;margin-top:12px")}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} style={sx(`flex:1;height:6px;border-radius:3px;background:${i <= step ? "#0F4C5C" : "rgba(27,27,27,.12)"}`)} />
        ))}
      </div>
      <div style={sx("display:flex;align-items:flex-end;gap:12px;margin-top:24px")}>
        <ZaraCharacter state={o.zara} amplitude={0} mouth={2} portrait size={64} />
        <div style={sx("flex:1;background:var(--color-card);border-radius:16px 16px 16px 4px;padding:10px 14px;font:400 18px/1.5 var(--font-body);color:var(--color-ink)")}>{o.bubble}</div>
      </div>
      <div style={sx("font:700 30px/1.4 var(--font-display);color:var(--color-ink);margin-top:22px")}>{o.title}</div>
      {children}
      <div style={sx("margin-top:auto;padding-bottom:28px;display:grid;gap:8px")}>
        {cta}
        {skip}
      </div>
    </Screen>
  );
}

/** The export's 56 px teal CTA of the onboarding steps. */
export function OnboardingCta({ label, onClick, disabled, testId, type = "button" }: { label: string; onClick?: () => void; disabled?: boolean; testId?: string; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} style={sx("height:56px;border:0;border-radius:12px;background:var(--color-teal);color:#fff;font:700 24px/1.5 var(--font-display);box-shadow:var(--shadow-button)", { opacity: disabled ? 0.45 : 1 })}>
      {label}
    </button>
  );
}

export function OnboardingSkip({ label, onClick, href }: { label: string; onClick?: () => void; href?: string }) {
  const css = sx("text-align:center;font:400 16px/1.5 var(--font-body);color:var(--color-ink-70);height:48px;display:flex;align-items:center;justify-content:center");
  return href ? (
    <a href={href} style={css}>
      {label}
    </a>
  ) : (
    <span role="button" onClick={onClick} style={css}>
      {label}
    </span>
  );
}

// --- step 1: phone + OTP ---------------------------------------------------------------

export interface PhoneStepProps {
  /** "dev": no SMS gateway — the notice, any 4-digit code. "provider": send → code → one resend after 30 s. */
  mode: "dev" | "provider";
  phone: string;
  onPhone?: (v: string) => void;
  /** Four boxes. */
  code: string[];
  codeActive: number;
  onCode?: (i: number, v: string) => void;
  /** provider: a code has gone out (the gateway accepted it) — only then do the code boxes show. */
  sent?: boolean;
  sending?: boolean;
  onSend?: () => void;
  /** provider, after a send: seconds until the one resend is offered (counts down once). */
  secondsLeft?: number | null;
  /** provider: "waiting" (counting down) · "available" (the button, once) · "used" (gone) · null. */
  resend?: "waiting" | "available" | "used" | null;
  onResend?: () => void;
}

export function PhoneStep({ mode, phone, onPhone, code, codeActive, onCode, sent = false, sending = false, onSend, secondsLeft = null, resend = null, onResend }: PhoneStepProps) {
  useLang();
  const showCode = mode === "dev" || sent;
  return (
    <div style={sx("display:grid;gap:14px;margin-top:16px")} data-testid="phone-step" data-sms-mode={mode}>
      <div style={sx("display:grid;gap:6px")}>
        <span style={sx(LABEL)}>{t("onb.1.phone")}</span>
        <label style={sx("height:56px;border:2px solid var(--color-teal);border-radius:12px;display:flex;align-items:center;padding:0 14px;gap:10px;font:500 22px/1 var(--font-latin);color:var(--color-ink);white-space:nowrap")}>
          <span style={sx("color:var(--color-ink-70)")}>+94</span>
          {onPhone ? <input inputMode="tel" value={phone} onChange={(e) => onPhone(e.target.value)} data-testid="onb-phone" disabled={sent} style={sx("border:0;background:transparent;font:500 22px/1 var(--font-latin);color:var(--color-ink);width:100%;padding:0")} /> : <span>{phone}</span>}
          {!onPhone && <span style={sx("width:2px;height:26px;background:var(--color-teal)")} />}
        </label>
      </div>
      {mode === "dev" && (
        <div data-testid="sms-dev-notice" style={sx("border:2px dashed var(--color-ink-18);border-radius:12px;padding:10px 14px;display:grid;gap:2px")}>
          <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("onb.1.devNotice")}</span>
          <span style={sx("font:600 13px/1.5 var(--font-latin);color:var(--color-ink-40)")}>{t("onb.1.devNoticeEn")}</span>
        </div>
      )}
      {mode === "provider" && !sent && (
        <button type="button" onClick={onSend} disabled={sending || !onSend} data-testid="otp-send" style={sx("height:52px;border:2px solid var(--color-teal);border-radius:12px;background:var(--color-card);color:var(--color-teal);font:600 18px/1.5 var(--font-label)", { opacity: sending ? 0.6 : 1 })}>
          {t("onb.1.send")}
        </button>
      )}
      {showCode && (
        <div style={sx("display:grid;gap:6px")}>
          <span style={sx(LABEL)}>{t("onb.1.code")}</span>
          <div style={sx("display:grid;grid-template-columns:repeat(4,1fr);gap:8px")} data-testid="onb-otp">
            {code.map((v, i) => (
              <div key={i} style={sx(`height:56px;border:2px solid ${i === codeActive ? "#0F4C5C" : "rgba(27,27,27,.18)"};border-radius:12px;background:${v ? "#EEF4F5" : "#fff"};display:flex;align-items:center;justify-content:center;font:600 24px/1 var(--font-latin);color:var(--color-ink)`)}>
                {onCode ? <input inputMode="numeric" maxLength={1} value={v} onChange={(e) => onCode(i, e.target.value.replace(/\D/gu, "").slice(-1))} aria-label={`otp ${i + 1}`} style={sx("width:100%;height:100%;border:0;background:transparent;text-align:center;font:600 24px/1 var(--font-latin);color:var(--color-ink);padding:0")} /> : v}
              </div>
            ))}
          </div>
        </div>
      )}
      {mode === "provider" && sent && resend === "waiting" && secondsLeft !== null && (
        <span data-testid="otp-countdown" style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-teal)")}>{t("onb.1.resend", { t: `0:${String(Math.max(0, secondsLeft)).padStart(2, "0")}` })}</span>
      )}
      {mode === "provider" && sent && resend === "available" && (
        <button type="button" onClick={onResend} disabled={sending || !onResend} data-testid="otp-resend" style={sx("height:48px;border:0;border-radius:12px;background:transparent;color:var(--color-teal);font:600 16px/1.5 var(--font-body);text-align:left;padding:0")}>
          {t("onb.1.resendNow")}
        </button>
      )}
    </div>
  );
}

// --- step 2: child profile --------------------------------------------------------------

export function ProfileStep({ name, avatarIndex, grade, school, onName, onAvatar, onGrade, onSchool }: { name: string; avatarIndex: number | null; grade: 4 | 5; school?: string; onName?: (v: string) => void; onAvatar?: (i: number) => void; onGrade?: (g: 4 | 5) => void; onSchool?: (v: string) => void }) {
  useLang();
  const gradeBox = (g: 4 | 5) => (g === grade ? "flex:1;height:52px;border:2px solid var(--color-saffron);background:var(--color-saffron-soft);border-radius:12px;display:flex;align-items:center;justify-content:center;font:700 24px/1 var(--font-display)" : "flex:1;height:52px;border:2px solid var(--color-ink-18);border-radius:12px;display:flex;align-items:center;justify-content:center;font:700 24px/1 var(--font-display)");
  return (
    <div style={sx("display:grid;gap:14px;margin-top:16px")}>
      <div style={sx("display:grid;gap:6px")}>
        <span style={sx(LABEL)}>{t("onb.2.name")}</span>
        <div style={sx("height:56px;border:2px solid var(--color-ink-18);border-radius:12px;display:flex;align-items:center;padding:0 14px;font:700 24px/1 var(--font-display);color:var(--color-ink)")}>
          {onName ? <input value={name} onChange={(e) => onName(e.target.value)} data-testid="onb-name" style={sx("width:100%;border:0;background:transparent;font:700 24px/1 var(--font-display);color:var(--color-ink);padding:0")} /> : name}
        </div>
      </div>
      <div style={sx("display:grid;gap:6px")}>
        <span style={sx(LABEL)}>{t("onb.2.avatar")}</span>
        <div style={sx("display:grid;grid-template-columns:repeat(4,1fr);gap:10px")} data-testid="onb-avatars">
          {AVATARS.map((a, i) => (
            <div key={a} role={onAvatar ? "button" : undefined} onClick={onAvatar ? () => onAvatar(i) : undefined} data-avatar={a} data-selected={i === avatarIndex || undefined} style={sx(`aspect-ratio:1;border-radius:50%;background:${i === avatarIndex ? "#FBEFD3" : "#EEF4F5"};border:3px solid ${i === avatarIndex ? "#E9B44C" : "transparent"};display:flex;align-items:center;justify-content:center;box-sizing:border-box`)}>
              <ArtSlot size="60%" label={a} alpha=".14" font="9px/1" />
            </div>
          ))}
        </div>
      </div>
      <div style={sx("display:grid;gap:6px")}>
        <span style={sx(LABEL)}>{t("onb.2.grade")}</span>
        <div style={sx("display:flex;gap:10px")}>
          {([4, 5] as const).map((g) => (
            <div key={g} role={onGrade ? "button" : undefined} onClick={onGrade ? () => onGrade(g) : undefined} data-grade={g} style={sx(gradeBox(g))}>
              {g}
            </div>
          ))}
        </div>
      </div>
      <div style={sx("display:grid;gap:6px")}>
        <span style={sx(LABEL)}>{t("onb.2.school")}</span>
        <div style={sx("height:52px;border:2px solid var(--color-ink-18);border-radius:12px;display:flex;align-items:center;padding:0 14px;font:400 18px/1 var(--font-body);color:var(--color-ink-40)")}>
          {onSchool ? <input value={school ?? ""} placeholder={t("onb.2.schoolPlaceholder")} onChange={(e) => onSchool(e.target.value)} style={sx("width:100%;border:0;background:transparent;font:400 18px/1 var(--font-body);color:var(--color-ink);padding:0")} /> : t("onb.2.schoolPlaceholder")}
        </div>
      </div>
    </div>
  );
}

// --- step 3: consent ---------------------------------------------------------------------

const CONSENT = [
  { i: "1", bg: "#0F4C5C", t: t("onb.3.c1.t"), d: t("onb.3.c1.d") },
  { i: "2", bg: "#3C8C5A", t: t("onb.3.c2.t"), d: t("onb.3.c2.d") },
  { i: "3", bg: "#D9643A", t: t("onb.3.c3.t"), d: t("onb.3.c3.d") },
];

export function ConsentStep({ privacyHref = "#" }: { privacyHref?: string }) {
  useLang();
  return (
    <div style={sx("display:grid;gap:12px;margin-top:16px")}>
      {CONSENT.map((c) => (
        <div key={c.i} style={sx("display:flex;gap:12px;align-items:flex-start;background:var(--color-card);border-radius:14px;padding:12px 14px")}>
          <span style={sx(`width:32px;height:32px;border-radius:50%;background:${c.bg};color:#fff;display:flex;align-items:center;justify-content:center;font:700 16px/1 var(--font-latin);flex:none`)}>{c.i}</span>
          <div style={sx("display:grid;gap:2px")}>
            <span style={sx("font:700 20px/1.4 var(--font-display);color:var(--color-ink)")}>{c.t}</span>
            <span style={sx("font:400 17px/1.5 var(--font-body);color:var(--color-ink-70)")}>{c.d}</span>
          </div>
        </div>
      ))}
      <a href={privacyHref} style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-teal);text-decoration:underline")}>{t("onb.3.privacy")}</a>
    </div>
  );
}

// --- step 4: subscription -----------------------------------------------------------------

export function PayStep({ method, onMethod }: { method: "card" | "bank"; onMethod?: (m: "card" | "bank") => void }) {
  useLang();
  const box = (on: boolean) => (on ? "flex:1;height:52px;border:2px solid var(--color-teal);border-radius:12px;display:flex;align-items:center;justify-content:center;font:600 18px/1 var(--font-label)" : "flex:1;height:52px;border:2px solid var(--color-ink-18);border-radius:12px;display:flex;align-items:center;justify-content:center;font:600 18px/1 var(--font-label);color:var(--color-ink-70)");
  return (
    <div style={sx("display:grid;gap:12px;margin-top:16px")}>
      <div style={sx("border:2px solid var(--color-teal);border-radius:16px;padding:14px 16px;display:grid;gap:4px;background:var(--color-card);position:relative")}>
        <span style={sx("position:absolute;top:-12px;left:14px;background:var(--color-saffron);border-radius:999px;padding:2px 10px;font:600 14px/1.4 var(--font-label);color:var(--color-ink)")}>{t("onb.4.freeWeek")}</span>
        <div style={sx("display:flex;justify-content:space-between;align-items:baseline")}>
          <span style={sx("font:700 22px/1.4 var(--font-display)")}>{t("onb.4.oneChild")}</span>
          <span style={sx("font:700 26px/1 var(--font-display);color:var(--color-teal);white-space:nowrap")}>
            {t("onb.4.price1")}
            <span style={sx("font:400 15px/1 var(--font-body);color:var(--color-ink-70)")}>{t("onb.4.perMonth")}</span>
          </span>
        </div>
        <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("onb.4.includes")}</span>
      </div>
      <div style={sx("border:2px solid var(--color-ink-18);border-radius:16px;padding:14px 16px;display:flex;justify-content:space-between;align-items:baseline")}>
        <span style={sx("font:700 22px/1.4 var(--font-display);white-space:nowrap")}>{t("onb.4.twoChildren")}</span>
        <span style={sx("font:700 26px/1 var(--font-display);color:var(--color-ink);white-space:nowrap")}>
          {t("onb.4.price2")}
          <span style={sx("font:400 15px/1 var(--font-body);color:var(--color-ink-70)")}>{t("onb.4.perMonth")}</span>
        </span>
      </div>
      <div style={sx("display:grid;gap:6px;margin-top:4px")}>
        <span style={sx(LABEL)}>{t("onb.4.payment")}</span>
        <div style={sx("display:flex;gap:8px")}>
          <div role={onMethod ? "button" : undefined} onClick={onMethod ? () => onMethod("card") : undefined} style={sx(box(method === "card"))}>{t("onb.4.card")}</div>
          <div role={onMethod ? "button" : undefined} onClick={onMethod ? () => onMethod("bank") : undefined} style={sx(box(method === "bank"))}>{t("onb.4.bank")}</div>
        </div>
      </div>
      <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("onb.4.sms")}</span>
    </div>
  );
}
