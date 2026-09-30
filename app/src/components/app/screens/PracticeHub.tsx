import Link from "next/link";
import ZaraCharacter from "@/components/ZaraCharacter";
import { BottomNav, Ring, Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import { MASTERY_PERCENT, PRACTICE_MINUTES } from "@/lib/settings";
import type { PracticeData } from "@/lib/appTypes";

/** Screens C · Practice hub. `rings` lets the preview pass the export's literal ring colours/offsets. */
export function PracticeHubScreen({ data, frame, rings }: { data: PracticeData; frame?: boolean; rings?: Array<{ c: string; o: number }> }) {
  return (
    <Screen label="Practice hub" frame={frame} root="background:var(--color-board);display:flex;flex-direction:column">
      <div style={sx("padding:52px 20px 0;display:flex;align-items:center;gap:12px")}>
        <div style={sx("display:grid;flex:1")}>
          <span style={sx("font:700 28px/1.5 var(--font-display)")}>{t("practice.title")}</span>
          <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("practice.subtitle", { n: PRACTICE_MINUTES })}</span>
        </div>
        <ZaraCharacter state="idle" amplitude={0} portrait size={64} />
      </div>
      <div style={sx("padding:16px 20px 0;display:grid;gap:10px")}>
        {data.rows.map((p, i) => {
          const ring = rings?.[i];
          const pct = p.pct ?? 0;
          const color = ring?.c ?? (pct >= MASTERY_PERCENT ? "#3C8C5A" : pct > 0 ? "#E9B44C" : "rgba(27,27,27,.3)");
          const fraction = ring ? 1 - ring.o / 138 : pct / 100;
          return (
            <Link key={p.tag} href={`/practice/quiz?concept=${encodeURIComponent(p.tag)}`} data-testid="practice-row" style={sx("background:var(--color-paper);border:2px solid var(--color-ink-10);border-radius:16px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 0 #D8D1C2")}>
              <Ring size={56} color={color} fraction={fraction} />
              <div style={sx("flex:1;display:grid")}>
                <span style={sx("font:700 22px/1.4 var(--font-display)")}>{p.title}</span>
                <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{p.sub}</span>
              </div>
              <span style={sx("width:48px;height:48px;border-radius:50%;background:var(--color-teal);color:#fff;display:flex;align-items:center;justify-content:center;font:16px/1 var(--font-latin)")}>▶</span>
            </Link>
          );
        })}
        {data.rows.length === 0 && (
          <div style={sx("background:var(--color-paper);border:2px solid var(--color-ink-10);border-radius:16px;padding:12px 14px;display:flex;align-items:center;gap:12px")} data-testid="practice-empty">
            <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("practice.empty")}</span>
          </div>
        )}
        <div style={sx("display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px")}>
          <div style={sx("border:2px dashed var(--color-ink-18);border-radius:16px;padding:14px;display:grid;gap:4px;min-height:96px")}>
            <span style={sx("font:700 20px/1.4 var(--font-display);color:var(--color-ink-40)")}>{t("practice.pastPapers")}</span>
            <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-40)")}>{t("common.soon")}</span>
          </div>
          <div style={sx("background:var(--color-coral-soft);border-radius:16px;padding:14px;display:grid;gap:4px;min-height:96px")}>
            <span style={sx("font:700 20px/1.4 var(--font-display);color:var(--color-ink)")}>{t("practice.challenge")}</span>
            <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-coral-text)")}>{frame ? t("practice.challengeSub") : t("common.soon")}</span>
          </div>
        </div>
      </div>
      <BottomNav active={2} />
    </Screen>
  );
}
