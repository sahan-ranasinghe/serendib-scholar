import Link from "next/link";
import ZaraCharacter from "@/components/ZaraCharacter";
import LenaCharacter from "@/components/LenaCharacter";
import { ArtSlot, BottomNav, Ring, Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import { PRACTICE_MINUTES, STICKER_SLOTS } from "@/lib/settings";
import type { HomeData } from "@/lib/appTypes";

/** The first letter of a name as a reader sees it (a Sinhala letter with its vowel sign is one). */
export function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  try {
    const first = new Intl.Segmenter("si", { granularity: "grapheme" }).segment(trimmed)[Symbol.iterator]().next();
    if (!first.done) return first.value.segment;
  } catch {
    // no Segmenter: the first code point will do
  }
  return Array.from(trimmed)[0] ?? "";
}

/** The header's child: avatar, name, and the ▾ that says it opens. The switcher (ChildSwitcher) wraps it in its button. */
export function ChildChip({ name }: { name: string }) {
  return (
    <span data-testid="child-chip" style={sx("display:inline-flex;align-items:center;gap:8px;min-height:56px;max-width:100%;padding:0 12px 0 4px;border-radius:999px;background:var(--color-paper);border:2px solid var(--color-ink-10);box-sizing:border-box")}>
      <span style={sx("width:44px;height:44px;border-radius:50%;background:var(--color-saffron-soft);border:2px solid var(--color-saffron);display:flex;align-items:center;justify-content:center;font:700 20px/1 var(--font-display);color:var(--color-ink);flex:none")}>{initialOf(name)}</span>
      <span style={sx("font:700 20px/1.5 var(--font-display);color:var(--color-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0")}>{name}</span>
      <span aria-hidden style={sx("font:600 14px/1 var(--font-latin);color:var(--color-ink-70);flex:none")}>▾</span>
    </span>
  );
}

/**
 * Screens A · Child home. `start` is the continue card's button (it starts
 * the session); `child` is the header's child switcher (the live route
 * passes ChildSwitcher; without it the chip is drawn, inert).
 */
export function HomeScreen({ data, frame, start, child }: { data: HomeData; frame?: boolean; start: React.ReactNode; child?: React.ReactNode }) {
  const c = data.continue;
  const card = "background:var(--color-paper);border:2px solid var(--color-ink-10);border-radius:16px;padding:10px 8px;display:grid;gap:2px;min-height:96px;align-content:start;box-shadow:0 2px 0 #D8D1C2";
  return (
    <Screen label="Home" frame={frame} root="background:var(--color-board);display:flex;flex-direction:column">
      {/* The first 36 px stay clear: the "updating / offline" pill (AppStateBadge, fixed at the top) lands there, over nothing. */}
      <div style={sx("padding:36px 12px 0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px")} data-testid="home-topbar">
        <div style={sx("min-width:0;flex:0 1 auto;display:flex")}>{child ?? <ChildChip name={data.name} />}</div>
        <Link href="/parent" aria-label={t("home.parent")} data-testid="parent-lock" style={sx("flex:none;min-height:56px;min-width:56px;padding:0 14px 0 10px;border-radius:999px;background:var(--color-paper);border:2px solid var(--color-ink-10);display:inline-flex;align-items:center;gap:8px;box-sizing:border-box;color:var(--color-teal)")}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor" aria-hidden>
            <circle cx="12" cy="8" r="5" />
            <path d="M3 28v-6a9 9 0 0 1 18 0v6Z" />
            <circle cx="24.5" cy="15.5" r="3.5" />
            <path d="M19 28v-3a5.5 5.5 0 0 1 11 0v3Z" opacity=".7" />
          </svg>
          <span data-testid="parent-lock-label" style={sx("font:700 20px/1.5 var(--font-display);color:var(--color-ink)")}>{t("home.parent")}</span>
        </Link>
      </div>
      <div style={sx("padding:4px 20px 0;display:flex;align-items:flex-start;gap:12px")}>
        <ZaraCharacter state="talking" amplitude={0} mouth={2} portrait size={64} />
        <div style={sx("flex:1;display:grid;gap:2px;padding-top:4px")} data-testid="home-greeting">
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
              <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("common.minutesN", { n: PRACTICE_MINUTES })}</span>
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
            <span style={sx("font:700 20px/1.5 var(--font-display);color:var(--color-ink)")}>{data.badge ? t("home.newBadge", { name: data.badge.name }) : t("home.badgesCount", { earned: 0, total: STICKER_SLOTS })}</span>
            <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{data.badge ? t("home.badgeReason", { concept: data.badge.conceptTitle }) : t("common.notYet")}</span>
          </div>
          <span style={sx("font:20px/1 var(--font-latin);color:var(--color-ink-40)")}>›</span>
        </Link>
      </div>
      <BottomNav active={0} />
    </Screen>
  );
}
