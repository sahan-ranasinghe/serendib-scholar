import ZaraCharacter from "@/components/ZaraCharacter";
import { BackButton, Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import type { LessonDetailData } from "@/lib/appTypes";

/** Screens A's `sess()` — the row looks per kind, verbatim. */
function rowStyle(kind: "done" | "current" | "locked") {
  return {
    bg: kind === "current" ? "#EEF4F5" : "#FFFDF8",
    border: kind === "current" ? "2px solid #0F4C5C" : "2px solid rgba(27,27,27,.1)",
    sh: kind === "current" ? "0 8px 20px rgba(15,76,92,.12)" : "none",
    op: kind === "locked" ? 0.6 : 1,
    icon: kind === "done" ? "✓" : kind === "current" ? "▶" : "🔒",
    iconBg: kind === "done" ? "#3C8C5A" : kind === "current" ? "#0F4C5C" : "rgba(27,27,27,.08)",
    iconFg: kind === "locked" ? "#1B1B1B" : "#fff",
  };
}

/** Screens A · Lesson detail. `cta` is the caller's start button (60 px). */
export function LessonDetailScreen({ data, frame, cta }: { data: LessonDetailData; frame?: boolean; cta: React.ReactNode }) {
  return (
    <Screen label="Lesson detail" frame={frame} root="background:var(--color-board);display:flex;flex-direction:column">
      <div style={sx("padding:52px 20px 0;display:flex;align-items:center;gap:12px")}>
        <BackButton href="/lessons" />
        <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("detail.kicker", { lesson: data.lessonNumber })}</span>
      </div>
      <div style={sx("padding:12px 20px 0;display:grid;gap:12px")}>
        <div style={sx("display:flex;align-items:flex-start;gap:14px")}>
          <div style={sx("display:grid;gap:2px;flex:1")}>
            <div style={sx("font:700 36px/1.4 var(--font-display);color:var(--color-ink)")}>{data.title}</div>
            <div style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("detail.subtitle", { sessions: data.sessionsCount, minutes: data.minutes, stars: data.stars, total: data.starsTotal })}</div>
          </div>
          <ZaraCharacter state="encourage" amplitude={0} portrait size={64} />
        </div>
        <div style={sx("display:flex;flex-wrap:wrap;gap:8px")}>
          {data.concepts.map((c) => (
            <span key={c} style={sx("height:40px;padding:0 14px;border-radius:999px;background:var(--color-card);display:flex;align-items:center;font:600 20px/1.5 var(--font-label);color:var(--color-teal)")}>
              {c}
            </span>
          ))}
        </div>
        <div style={sx("display:grid;gap:10px")}>
          {data.sessions.map((s) => {
            const r = rowStyle(s.kind);
            return (
              <div key={s.title} data-kind={s.kind} style={sx(`background:${r.bg};border:${r.border};border-radius:16px;padding:8px 14px;display:flex;align-items:center;gap:12px;box-shadow:${r.sh};opacity:${r.op}`)}>
                <span style={sx(`width:44px;height:44px;border-radius:50%;background:${r.iconBg};color:${r.iconFg};display:flex;align-items:center;justify-content:center;font:700 20px/1 var(--font-latin);flex:none`)}>{r.icon}</span>
                <div style={sx("flex:1;display:grid;gap:2px")}>
                  <span style={sx("font:700 22px/1.4 var(--font-display);color:var(--color-ink)")}>{s.title}</span>
                  <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{s.sub}</span>
                </div>
                <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70);white-space:nowrap")}>{s.min}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={sx("margin-top:auto;flex:none;padding:12px 20px 28px")}>{cta}</div>
    </Screen>
  );
}
