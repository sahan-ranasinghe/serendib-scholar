import ZaraCharacter from "@/components/ZaraCharacter";
import { BottomNav, Ring, Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import type { ProgressData } from "@/lib/appTypes";

/** Screens C · Progress (child) — mastery map. */
export function ProgressScreen({ data, frame }: { data: ProgressData; frame?: boolean }) {
  return (
    <Screen label="Progress" frame={frame} root="background:var(--color-board);display:flex;flex-direction:column">
      <div style={sx("padding:52px 20px 0;display:flex;align-items:center;gap:12px")}>
        <div style={sx("display:grid;flex:1")}>
          <span style={sx("font:700 28px/1.5 var(--font-display)")}>{t("progress.title")}</span>
          <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("progress.subtitle", { mastered: data.mastered, total: data.total })}</span>
        </div>
        <ZaraCharacter state="encourage" amplitude={0} portrait size={64} />
      </div>
      <div style={sx("padding:16px 20px 0;display:grid;gap:8px")}>
        {data.rows.map((m) => {
          const c = m.pct >= 85 ? "#3C8C5A" : m.pct > 0 ? "#E9B44C" : "rgba(27,27,27,.3)";
          return (
            <div key={m.title} data-testid="mastery-row" style={sx("display:flex;align-items:center;gap:12px;background:var(--color-paper);border:2px solid var(--color-ink-10);border-radius:14px;padding:8px 12px")}>
              <Ring size={48} color={c} fraction={m.pct / 100} />
              <span style={sx("flex:1;font:700 20px/1.5 var(--font-display)")}>{m.title}</span>
              <span style={sx("display:flex;align-items:center;gap:6px;font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>
                <span style={sx(`width:10px;height:10px;border-radius:50%;background:${c}`)} />
                {m.status}
              </span>
            </div>
          );
        })}
        {data.sentence && (
          <div style={sx("display:flex;gap:12px;align-items:flex-start;margin-top:8px;background:var(--color-card);border-radius:16px 16px 16px 4px;padding:12px 14px")}>
            <span style={sx("font:400 20px/1.5 var(--font-body);color:var(--color-ink)")}>{data.sentence}</span>
          </div>
        )}
      </div>
      <BottomNav active={0} />
    </Screen>
  );
}
