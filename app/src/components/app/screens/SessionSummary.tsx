import ZaraCharacter from "@/components/ZaraCharacter";
import LenaCharacter from "@/components/LenaCharacter";
import { PrimaryButton, Screen, SecondaryButton } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import type { SummaryData } from "@/lib/appTypes";

const COLS = ["#E05263", "#F2A541", "#3F8F5F", "#4A7BD0"];
/** Screens A's confetti, verbatim (16 pieces, deterministic). */
const CONFETTI = Array.from({ length: 16 }, (_, i) => ({ x: `${(i * 23) % 100}%`, y: `${((i * 31) % 34) + 4}%`, c: COLS[i % 4]!, r: `${((i * 53) % 90) - 45}deg` }));

/** Screens A · Session summary. */
export function SessionSummaryScreen({ data, frame, extra }: { data: SummaryData; frame?: boolean; extra?: React.ReactNode }) {
  return (
    <Screen label="Session summary" frame={frame} root="background:var(--color-board);display:flex;flex-direction:column;align-items:center;padding:0 20px">
      <div style={sx("position:absolute;inset:0;pointer-events:none")} aria-hidden>
        {CONFETTI.map((c, i) => (
          <span key={i} style={sx(`position:absolute;left:${c.x};top:${c.y};width:8px;height:14px;border-radius:2px;background:${c.c};transform:rotate(${c.r})`)} />
        ))}
      </div>
      <div style={sx("margin-top:56px")}>
        <ZaraCharacter state="celebrate" amplitude={0} size={200} />
      </div>
      <div style={sx("font:700 36px/1.4 var(--font-display);color:var(--color-ink);margin-top:-8px")}>{t("summary.title", { name: data.name })}</div>
      <div style={sx("width:100%;background:var(--color-paper);border:2px solid var(--color-ink-10);border-radius:20px;padding:16px 18px;display:grid;gap:12px;margin-top:14px;box-shadow:var(--shadow-paper)")} data-testid="summary-lines">
        <div style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("summary.today")}</div>
        {data.lines.map((l) => (
          <div key={l} style={sx("display:flex;gap:10px;align-items:flex-start")}>
            <span style={sx("width:24px;height:24px;border-radius:50%;background:var(--color-success);color:#fff;font:700 15px/24px var(--font-latin);text-align:center;flex:none;margin-top:4px")}>✓</span>
            <span style={sx("font:400 22px/1.5 var(--font-body);color:var(--color-ink)")}>{l}</span>
          </div>
        ))}
        {!data.hasSession && <div data-testid="summary-none" style={sx("font:400 22px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("summary.none")}</div>}
      </div>
      <div style={sx("display:flex;gap:24px;align-items:center;margin-top:14px")}>
        <div style={sx("display:grid;justify-items:center;gap:2px")}>
          <span style={sx("font-size:34px;line-height:1;color:var(--color-saffron);letter-spacing:-2px")}>
            {"★".repeat(data.stars)}
            <span style={sx("color:rgba(27,27,27,.18)")}>{"★".repeat(3 - data.stars)}</span>
          </span>
          <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("common.starsN", { n: data.stars })}</span>
        </div>
        <div style={sx("display:flex;align-items:center;gap:6px;background:var(--color-coral-soft);border-radius:999px;padding:4px 14px 4px 4px")}>
          <LenaCharacter state="hop" size={44} />
          <span style={sx("font:700 24px/1.5 var(--font-display);color:var(--color-coral-text)")}>{t("common.daysN", { n: data.streakDays })}</span>
          {data.plusOne && <span style={sx("font:700 18px/1 var(--font-latin);color:var(--color-coral-text)")}>{t("summary.plusOne")}</span>}
        </div>
      </div>
      {data.hasSession && !data.moreAllowed && (
        <div data-testid="summary-limit" style={sx("margin-top:14px;font:600 20px/1.5 var(--font-body);color:var(--color-ink);text-align:center")}>
          {t("limit.reached")}
        </div>
      )}
      {extra}
      <div style={sx("margin-top:auto;width:100%;display:grid;gap:10px;padding-bottom:32px")}>
        <PrimaryButton href="/home" height={60} testId="summary-home">
          {t("summary.tomorrow")}
        </PrimaryButton>
        {data.moreAllowed && (
          <SecondaryButton href="/session" height={48} testId="summary-more">
            {t("summary.more")}
          </SecondaryButton>
        )}
      </div>
    </Screen>
  );
}
