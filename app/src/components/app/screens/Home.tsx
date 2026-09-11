import Link from "next/link";
import ZaraCharacter from "@/components/ZaraCharacter";
import LenaCharacter from "@/components/LenaCharacter";
import { ArtSlot, BottomNav, Ring, Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import type { HomeData } from "@/lib/appTypes";

/** Screens A · Child home. `start` is the continue card's button (it starts the session). */
export function HomeScreen({ data, frame, start }: { data: HomeData; frame?: boolean; start: React.ReactNode }) {
  const c = data.continue;
  const card = "background:var(--color-paper);border:2px solid var(--color-ink-10);border-radius:16px;padding:10px 8px;display:grid;gap:2px;min-height:96px;align-content:start;box-shadow:0 2px 0 #D8D1C2";
  return (
    <Screen label="Home" frame={frame} root="background:var(--color-board);display:flex;flex-direction:column">
      <div style={sx("padding:52px 20px 0;display:flex;align-items:flex-start;gap:12px")}>
        <ZaraCharacter state="talking" amplitude={0} mouth={2} portrait size={64} />
        <div style={sx("flex:1;display:grid;gap:2px;padding-top:4px")}>
          <div style={sx("font:700 28px/1.5 var(--font-display);color:var(--color-ink)")}>{t("home.greeting", { name: data.name })}</div>
          <div style={sx("font:400 20px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("home.startToday")}</div>
        </div>
        <div style={sx("display:grid;gap:6px;justify-items:end")}>
          <div style={sx("display:flex;align-items:center;gap:6px")} data-testid="goal-ring">
            <Ring size={48} color="#E9B44C" fraction={data.dailyGoal ? data.minutesToday / data.dailyGoal : 0} label={`${data.minutesToday}/${data.dailyGoal}`} fontSize={14} textY={28} />
          </div>
          <div style={sx("display:flex;align-items:center;gap:4px;background:var(--color-coral-soft);border-radius:999px;padding:2px 10px 2px 2px")} data-testid="streak">
            <LenaCharacter state="hold-flame" size={36} />
            <span style={sx("font:700 20px/1.5 var(--font-display);color:var(--color-coral-text)")}>{t("common.daysN", { n: data.streakDays })}</span>
          </div>
        </div>
      </div>
      <div style={sx("padding:14px 20px 0;display:grid;gap:12px")}>
        <div style={sx("background:var(--color-card);border-radius:20px;padding:14px 16px;display:grid;gap:12px;box-shadow:var(--shadow-card)")} data-testid="continue-card">
          <div style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-teal)")}>{c ? t("home.continueKicker", { lesson: c.lessonNumber, session: c.sessionNumber }) : t("brand.maths")}</div>
          <div style={sx("font:700 28px/1.5 var(--font-display);color:var(--color-ink)")}>{c ? c.lessonTitle : t("common.soon")}</div>
          <div style={sx("display:flex;align-items:center;gap:14px")}>
            <Ring size={64} color="#E9B44C" fraction={c ? c.sessionsDone / c.sessionsTotal : 0} label={c ? `${c.sessionsDone}/${c.sessionsTotal}` : "0/0"} fontSize={18} textY={37} />
            {start}
          </div>
        </div>
        <div style={sx("display:grid;gap:8px")}>
          <div style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("home.today")}</div>
          <div style={sx("display:grid;grid-template-columns:repeat(3,1fr);gap:10px")}>
            <Link href="/session" style={sx(card)}>
              <span style={sx("width:12px;height:12px;border-radius:50%;background:var(--color-saffron)")} />
              <span style={sx("font:700 20px/1.5 var(--font-display);color:var(--color-ink)")}>{t("home.continueLesson")}</span>
              <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{c ? t("common.minutesN", { n: c.minutes }) : t("common.notYet")}</span>
            </Link>
            <Link href="/practice" style={sx(card)}>
              <span style={sx("width:12px;height:12px;border-radius:50%;background:var(--color-success)")} />
              <span style={sx("font:700 20px/1.5 var(--font-display);color:var(--color-ink)")}>{t("home.practice")}</span>
              <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("common.minutesN", { n: 3 })}</span>
            </Link>
            <Link href="/practice" style={sx(card)}>
              <span style={sx("width:12px;height:12px;border-radius:50%;background:var(--color-coral)")} />
              <span style={sx("font:700 20px/1.5 var(--font-display);color:var(--color-ink)")}>{t("home.yesterdayAgain")}</span>
              <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{data.weakest ?? t("common.notYet")}</span>
            </Link>
          </div>
        </div>
        <div style={sx("display:grid;gap:8px")}>
          <div style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("home.subjects")}</div>
          <div style={sx("display:grid;grid-template-columns:repeat(3,1fr);gap:10px")}>
            <Link href="/lessons" style={sx("height:72px;border-radius:16px;background:var(--color-teal);color:#fff;display:flex;align-items:center;justify-content:center;font:700 22px/1.5 var(--font-display)")}>{t("brand.maths")}</Link>
            <div style={sx("height:72px;border-radius:16px;background:var(--color-paper);border:2px solid var(--color-ink-10);display:flex;align-items:center;justify-content:center;font:700 22px/1.5 var(--font-display);color:var(--color-ink)")}>{t("home.subjectSinhala")}</div>
            <div style={sx("height:72px;border-radius:16px;border:2px dashed var(--color-ink-18);display:flex;flex-direction:column;align-items:center;justify-content:center;font:600 20px/1.3 var(--font-label);color:var(--color-ink-40)")}>
              <span style={sx("font-size:16px")}>🔒</span>
              {t("common.soon")}
            </div>
          </div>
        </div>
        <Link href="/rewards" style={sx("display:flex;align-items:center;gap:12px;background:var(--color-paper);border:2px solid var(--color-ink-10);border-radius:16px;padding:6px 14px")} data-testid="rewards-peek">
          <div style={sx("width:48px;height:48px;border-radius:50%;background:var(--color-paper);border:3px solid var(--color-saffron);display:flex;align-items:center;justify-content:center")}>
            <ArtSlot size={28} />
          </div>
          <div style={sx("flex:1;display:grid")}>
            <span style={sx("font:700 20px/1.5 var(--font-display);color:var(--color-ink)")}>{data.badge ? t("home.newBadge", { name: data.badge.name }) : t("home.badgesCount", { earned: 0, total: 12 })}</span>
            <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{data.badge ? t("home.badgeReason", { concept: data.badge.conceptTitle }) : t("common.notYet")}</span>
          </div>
          <span style={sx("font:20px/1 var(--font-latin);color:var(--color-ink-40)")}>›</span>
        </Link>
      </div>
      <BottomNav active={0} />
      <Link href="/parent" title={t("home.parent")} aria-label={t("home.parent")} data-testid="parent-lock" style={sx("position:absolute;top:8px;right:12px;width:48px;height:48px;border-radius:50%;background:rgba(27,27,27,.08);display:flex;align-items:center;justify-content:center;font:20px/1 var(--font-latin);color:var(--color-ink-70)")}>
        🔒
      </Link>
    </Screen>
  );
}
