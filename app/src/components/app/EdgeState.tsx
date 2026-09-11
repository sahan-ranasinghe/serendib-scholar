import type { ReactNode } from "react";
import ZaraCharacter, { type ZaraState } from "@/components/ZaraCharacter";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import type { EdgeKind } from "@/lib/appTypes";

/**
 * The six edge states of Screens B.dc.html — loading, offline, paused,
 * rotate, mic permission, error — one component, the export's markup and
 * data rows verbatim. `frame` renders the export's 390×412 card; otherwise
 * the state fills its container (a page, or an overlay on the session).
 */
interface EdgeSpec {
  label: string;
  bg: string;
  spinner: boolean;
  zara: ZaraState | null;
  rotate: boolean;
  title: string;
  body: string;
  cta: string | null;
  alt: string | null;
}

const EDGES: Record<EdgeKind, EdgeSpec> = {
  loading: { label: "Loading", bg: "#F7F3EA", spinner: true, zara: "idle", rotate: false, title: t("edge.loading.title"), body: t("edge.loading.body"), cta: null, alt: null },
  offline: { label: "Offline", bg: "#F7F3EA", spinner: false, zara: "encourage", rotate: false, title: t("edge.offline.title"), body: t("edge.offline.body"), cta: t("common.retry"), alt: null },
  paused: { label: "Paused", bg: "rgba(27,27,27,.55)", spinner: false, zara: "idle", rotate: false, title: t("edge.paused.title"), body: t("edge.paused.body"), cta: t("edge.paused.resume"), alt: t("edge.paused.stop") },
  rotate: { label: "Rotate phone", bg: "#F7F3EA", spinner: false, zara: null, rotate: true, title: t("edge.rotate.title"), body: t("edge.rotate.body"), cta: null, alt: null },
  mic: { label: "Mic permission", bg: "#F7F3EA", spinner: false, zara: "talking", rotate: false, title: t("edge.mic.title"), body: t("edge.mic.body"), cta: t("edge.mic.allow"), alt: t("edge.mic.type") },
  error: { label: "Error", bg: "#F7F3EA", spinner: false, zara: "encourage", rotate: false, title: t("edge.error.title"), body: t("edge.error.body"), cta: t("common.retry"), alt: t("edge.error.home") },
};

export function edgeLabel(kind: EdgeKind): string {
  return EDGES[kind].label;
}

/** The export's edge buttons: teal primary (52 px) and a paper secondary. */
function Cta({ label, href, onClick, primary }: { label: string; href?: string; onClick?: () => void; primary: boolean }) {
  const css = primary
    ? "height:52px;padding:0 24px;border:0;border-radius:12px;background:var(--color-teal);color:#fff;font:700 22px/1.5 var(--font-display);box-shadow:var(--shadow-button);white-space:nowrap"
    : "height:52px;padding:0 20px;border:2px solid var(--color-ink-18);border-radius:12px;background:var(--color-paper);color:var(--color-teal);font:700 22px/1.5 var(--font-display);white-space:nowrap";
  if (href) {
    return (
      <a href={href} style={sx(css, { display: "flex", alignItems: "center", boxSizing: "border-box" })}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} style={sx(css)}>
      {label}
    </button>
  );
}

export function EdgeState({ kind, frame, onCta, onAlt, ctaHref, altHref, showLabel, style, children }: { kind: EdgeKind; frame?: boolean; onCta?: () => void; onAlt?: () => void; ctaHref?: string; altHref?: string; /** The export prints the state's name in a corner of each card. */ showLabel?: boolean; style?: React.CSSProperties; children?: ReactNode }) {
  const e = EDGES[kind];
  const fg = kind === "paused" ? "#fff" : "#1B1B1B";
  const fg2 = kind === "paused" ? "rgba(255,255,255,.85)" : "rgba(27,27,27,.7)";
  const root = `background:${e.bg};position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;box-sizing:border-box;text-align:center`;
  const size = frame ? { width: 390, height: 412, borderRadius: 32, boxShadow: "var(--shadow-card)" } : { width: "100%", minHeight: "100%" };
  return (
    <div className="app-screen" data-app-screen={e.label} data-edge={kind} style={sx(root, { ...size, ...style })}>
      {e.rotate && (
        <>
          <div style={sx("width:52px;height:96px;border:4px solid var(--color-teal);border-radius:10px;transform:rotate(-70deg);position:relative;margin:20px 0")}>
            <span style={sx("position:absolute;left:50%;bottom:6px;width:16px;height:4px;border-radius:2px;background:var(--color-teal);transform:translateX(-50%)")} />
          </div>
          <span style={sx("font:22px/1 var(--font-latin);color:var(--color-teal)")}>↻</span>
        </>
      )}
      {e.spinner && (
        <svg viewBox="0 0 64 64" width="56" height="56" data-testid="edge-spinner">
          <path d="M32 8a24 24 0 1 1-20 11" fill="none" stroke="#E9B44C" strokeWidth="5" strokeLinecap="round" />
        </svg>
      )}
      {e.zara && <ZaraCharacter state={e.zara} amplitude={0} mouth={2} portrait size={96} />}
      <div style={sx(`font:700 26px/1.5 var(--font-display);color:${fg};text-wrap:balance`)}>{e.title}</div>
      <div style={sx(`font:400 20px/1.5 var(--font-body);color:${fg2};text-wrap:pretty;max-width:300px`)}>{e.body}</div>
      {e.cta && (
        <div style={sx("display:flex;gap:10px;margin-top:6px")}>
          <Cta label={e.cta} href={ctaHref} onClick={onCta} primary />
          {e.alt && <Cta label={e.alt} href={altHref} onClick={onAlt} primary={false} />}
        </div>
      )}
      {children}
      {showLabel && <span style={sx("position:absolute;top:14px;left:18px;font:600 11px/1 var(--font-latin);color:var(--color-ink-40)")}>{e.label}</span>}
    </div>
  );
}
