"use client";

import { setLang } from "@/lib/langStore";
import { useLang } from "@/lib/useLang";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import "./app.css";

/**
 * One portrait screen of the app shell. The root carries the export's own
 * inline style for that frame; `frame` renders it as the export does on its
 * canvas (390×844 in a rounded card) for the fidelity check, otherwise it
 * fills the viewport.
 */
export function Screen({ label, root, frame, height = 844, children, style }: { label: string; root: string; frame?: boolean; height?: number; children: ReactNode; style?: CSSProperties }) {
  const size: CSSProperties = frame
    ? { width: 390, height, borderRadius: 32, overflow: "hidden", boxShadow: "var(--shadow-card)" }
    : { width: "100%", minHeight: "100dvh" };
  return (
    <div className="app-screen" data-app-screen={label} style={sx(root, { position: "relative", boxSizing: "border-box", ...size, ...style })}>
      {children}
    </div>
  );
}

/** Screens A/B/C's `navFor(active)`, verbatim. */
export function navFor(active: number) {
  return [t("nav.home"), t("nav.lessons"), t("nav.practice"), t("nav.rewards")].map((label, i) => ({
    t: label,
    bg: i === active ? "#EEF4F5" : "transparent",
    fg: i === active ? "#0F4C5C" : "rgba(27,27,27,.7)",
    dot: i === active ? "#0F4C5C" : "rgba(27,27,27,.18)",
  }));
}

const NAV_HREFS = ["/home", "/lessons", "/practice", "/rewards"];

/** The 84 px bottom nav with four Sinhala labels; `absolute` for the lesson map (the export pins it over the path). */
export function BottomNav({ active, absolute }: { active: number; absolute?: boolean }) {
  const base = absolute
    ? "position:absolute;left:0;right:0;bottom:0;height:84px;background:var(--color-paper);border-top:2px solid var(--color-ink-10);display:grid;grid-template-columns:repeat(4,1fr);padding:8px 8px 20px;box-sizing:border-box"
    : "margin-top:auto;flex:none;height:84px;background:var(--color-paper);border-top:2px solid var(--color-ink-10);display:grid;grid-template-columns:repeat(4,1fr);padding:8px 8px 20px;box-sizing:border-box";
  return (
    <nav data-testid="bottom-nav" style={sx(base, absolute ? undefined : { position: "sticky", bottom: 0, zIndex: 5 })}>
      {navFor(active).map((n, i) => (
        <Link key={n.t} href={NAV_HREFS[i]!} aria-current={i === active ? "page" : undefined} style={sx(`display:grid;justify-items:center;gap:0;align-content:center;border-radius:12px;background:${n.bg}`)}>
          <span style={sx(`width:8px;height:8px;border-radius:50%;background:${n.dot}`)} />
          <span style={sx(`font:700 20px/1.4 var(--font-display);color:${n.fg}`)}>{n.t}</span>
        </Link>
      ))}
    </nav>
  );
}

/** The export's progress ring: 48 (r19, stroke 6, dash 119), 56 (r22, dash 138) or 64 (r26, stroke 7, dash 163). */
export function Ring({ size, color, fraction, label, fontSize, textY }: { size: 48 | 56 | 64; color: string; fraction: number; label?: string; fontSize?: number; textY?: number }) {
  const spec = size === 64 ? { r: 26, w: 7, dash: 163 } : size === 56 ? { r: 22, w: 6, dash: 138 } : { r: 19, w: 6, dash: 119 };
  const c = size / 2;
  const offset = Math.round(spec.dash - spec.dash * Math.max(0, Math.min(1, fraction)));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={c} cy={c} r={spec.r} fill="none" stroke="rgba(27,27,27,.12)" strokeWidth={spec.w} />
      <circle cx={c} cy={c} r={spec.r} fill="none" stroke={color} strokeWidth={spec.w} strokeLinecap="round" strokeDasharray={spec.dash} strokeDashoffset={offset} transform={`rotate(-90 ${c} ${c})`} />
      {label !== undefined && (
        <text x={c} y={textY ?? c + 4} textAnchor="middle" fontFamily="Gemunu Libre" fontWeight="700" fontSize={fontSize ?? 14} fill="#1B1B1B">
          {label}
        </text>
      )}
    </svg>
  );
}

/** ‹ in a 56 px paper circle (child screens) or 44 px (parent screens). */
export function BackButton({ href, size = 56 }: { href: string; size?: 56 | 44 }) {
  const style = size === 56 ? "width:56px;height:56px;border-radius:50%;background:var(--color-paper);border:2px solid var(--color-ink-18);display:flex;align-items:center;justify-content:center;font:22px/1 var(--font-latin)" : "width:44px;height:44px;border-radius:50%;border:2px solid var(--color-ink-18);display:flex;align-items:center;justify-content:center;font:20px/1 var(--font-latin)";
  return (
    <Link href={href} aria-label={t("a11y.back")} style={sx(style, { flex: "none" })}>
      ‹
    </Link>
  );
}

/** සිං | EN — the parent header's toggle (Inter for the English only). */
export function LangToggle({ lang: langProp, onChange: onChangeProp }: { lang?: "si" | "en"; onChange?: (lang: "si" | "en") => void }) {
  // Unwired (the live app): the device's language store. Wired (the design preview): the caller's state.
  const storeLang = useLang();
  const lang = langProp ?? storeLang;
  const onChange = onChangeProp ?? setLang;
  const on = "padding:0 10px;background:var(--color-teal);color:#fff;font:600 14px/28px var(--font-label)";
  const offSi = "padding:0 10px;font:600 14px/28px var(--font-label);color:var(--color-ink-70)";
  const offEn = "padding:0 10px;font:500 13px/28px var(--font-latin);color:var(--color-ink-70)";
  const onEn = "padding:0 10px;background:var(--color-teal);color:#fff;font:500 13px/28px var(--font-latin)";
  return (
    <div role="group" aria-label="language" style={sx("display:flex;border:2px solid var(--color-ink-18);border-radius:999px;overflow:hidden;height:32px")}>
      <span role="button" aria-pressed={lang === "si"} data-testid="lang-si" onClick={() => onChange("si")} style={sx(lang === "si" ? on : offSi)}>{t("onb.toggleSi")}</span>
      <span role="button" aria-pressed={lang === "en"} data-testid="lang-en" onClick={() => onChange("en")} style={sx(lang === "en" ? onEn : offEn)}>EN</span>
    </div>
  );
}

/** The teal primary button of the child screens (56 px; 60 px for a screen's main CTA). */
export function PrimaryButton({ children, onClick, href, height = 56, font, style, testId, disabled, busy, type = "button" }: { children: ReactNode; onClick?: () => void; href?: string; height?: 56 | 60 | 52; font?: string; style?: CSSProperties; testId?: string; disabled?: boolean; /** The tap is being acted on: the button says so (data-busy, dimmed) until the action lands. */ busy?: boolean; type?: "button" | "submit" }) {
  const radius = height === 60 ? 14 : 12;
  const face = font ?? (height === 60 ? "700 26px/1.5 var(--font-display)" : "700 24px/1.5 var(--font-display)");
  const css = sx(`height:${height}px;border:0;border-radius:${radius}px;background:var(--color-teal);color:#fff;font:${face};box-shadow:var(--shadow-button)`, { display: "flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.45 : 1, ...style });
  if (href && !disabled) {
    return (
      <Link href={href} data-testid={testId} style={css}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} data-busy={busy || undefined} aria-busy={busy || undefined} style={busy ? { ...css, opacity: 0.8 } : css}>
      {children}
    </button>
  );
}

/** Paper secondary button (border ink-18, teal text). */
export function SecondaryButton({ children, onClick, href, height = 48, font, style, testId, busy }: { children: ReactNode; onClick?: () => void; href?: string; height?: 48 | 52 | 56; font?: string; style?: CSSProperties; testId?: string; busy?: boolean }) {
  const css = sx(`height:${height}px;border:2px solid var(--color-ink-18);border-radius:12px;background:var(--color-paper);color:var(--color-teal);font:${font ?? "700 22px/1.5 var(--font-display)"}`, { display: "flex", alignItems: "center", justifyContent: "center", ...style });
  if (href) {
    return (
      <Link href={href} data-testid={testId} style={css}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} data-testid={testId} data-busy={busy || undefined} aria-busy={busy || undefined} style={busy ? { ...css, opacity: 0.8 } : css}>
      {children}
    </button>
  );
}

/** A badge / avatar / sticker art slot: the export's striped placeholder, drawn as a placeholder (docs/design/art-needed.md). */
export function ArtSlot({ size, label, stripe = 3, gap = 7, alpha = ".12", font = "8px/1.2" }: { size: number | string; label?: string; stripe?: number; gap?: number; alpha?: string; font?: string }) {
  const dim = typeof size === "number" ? `${size}px` : size;
  return (
    <div data-art-slot={label ?? ""} style={sx(`width:${dim};height:${dim};border-radius:50%;background:repeating-linear-gradient(135deg,rgba(15,76,92,${alpha}) 0 ${stripe}px,transparent ${stripe}px ${gap}px);display:flex;align-items:center;justify-content:center;font:${font} ui-monospace,monospace;color:var(--color-ink-70);text-align:center`)}>
      {label}
    </div>
  );
}
