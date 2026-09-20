"use client";

import { useLang } from "@/lib/useLang";
import type { ReactNode } from "react";
import Link from "next/link";
import ZaraCharacter from "@/components/ZaraCharacter";
import { BackButton, LangToggle, Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import type { ParentZoneData, ProfilesData, ReportData } from "@/lib/appTypes";

const ROOT = "background:#FFFDF8;display:flex;flex-direction:column;padding:0 20px";

/** The paper-white parent header with teal title, a subtitle and the සිං|EN toggle. */
export function ParentHeader({ title, sub, back, lang, onLang }: { title: string; sub?: string; back?: string; lang?: "si" | "en"; onLang?: (l: "si" | "en") => void }) {
  const titleFont = back ? "font:700 24px/1.4 var(--font-display);color:var(--color-teal)" : "font:700 26px/1.4 var(--font-display);color:var(--color-teal)";
  return (
    <div style={sx("padding-top:52px;display:flex;align-items:center;justify-content:space-between")}>
      <div style={sx("display:flex;align-items:center;gap:10px")}>
        {back && <BackButton href={back} size={44} />}
        <div style={sx("display:grid")}>
          <span style={sx(titleFont)}>{title}</span>
          {sub && <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{sub}</span>}
        </div>
      </div>
      <LangToggle lang={lang} onChange={onLang} />
    </div>
  );
}

/** One settings row of the parent zone (min-height 56, a 1 px rule beneath). */
export function SettingsRow({ label, value, sub, href, onClick, color = "#1B1B1B", testId, chevron = true }: { label: string; value?: string; sub?: string; href?: string; onClick?: () => void; color?: string; testId?: string; chevron?: boolean }) {
  const inner = (
    <>
      <div style={sx("flex:1;display:grid")}>
        <span style={sx(`font:500 18px/1.5 var(--font-body);color:${color}`)}>{label}</span>
        {sub && <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{sub}</span>}
      </div>
      {value !== undefined && <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-teal)")}>{value}</span>}
      {chevron && <span style={sx("font:20px/1 var(--font-latin);color:var(--color-ink-40)")}>›</span>}
    </>
  );
  const css = sx("min-height:56px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--color-ink-10);padding:6px 2px");
  if (href) {
    return (
      <Link href={href} data-testid={testId} style={css}>
        {inner}
      </Link>
    );
  }
  return (
    <div role={onClick ? "button" : undefined} onClick={onClick} data-testid={testId} style={css}>
      {inner}
    </div>
  );
}

/** Screens B · Parent zone — home & settings. */
export function ParentZoneScreen({ data, frame, lang, onLang, subscriptionValue }: { data: ParentZoneData; frame?: boolean; lang?: "si" | "en"; onLang?: (l: "si" | "en") => void; subscriptionValue?: string }) {
  useLang();
  return (
    <Screen label="Parent zone" frame={frame} root={ROOT}>
      <ParentHeader title={t("parent.title")} sub={t("parent.childLine", { name: data.childName, grade: data.grade })} lang={lang} onLang={onLang} />
      <div style={sx("margin-top:16px;background:var(--color-card);border-radius:16px;padding:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center")} data-testid="parent-stats">
        <div style={sx("display:grid")}>
          <span style={sx("font:700 26px/1.2 var(--font-display);color:var(--color-teal)")}>{data.minutesWeek}</span>
          <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("parent.minWeek")}</span>
        </div>
        <div style={sx("display:grid")}>
          <span style={sx("font:700 26px/1.2 var(--font-display);color:var(--color-teal)")}>{data.sessionsWeek}</span>
          <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("parent.sessions")}</span>
        </div>
        <div style={sx("display:grid")}>
          <span style={sx("font:700 26px/1.2 var(--font-display);color:var(--color-teal)")}>{data.confident} / {data.conceptsTotal}</span>
          <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("parent.confident")}</span>
        </div>
      </div>
      <div style={sx("margin-top:14px;display:grid;gap:2px")} data-testid="parent-settings">
        <SettingsRow label={t("parent.row.report")} value={data.reportRange} href="/parent/report" testId="row-report" />
        <SettingsRow label={t("parent.row.billing")} value={subscriptionValue ?? t("common.soon")} href="/parent/subscription" testId="row-billing" />
        <SettingsRow label={t("parent.row.limit")} value={t("common.minutesN", { n: data.settings.dailyLimitMinutes })} sub={t("parent.row.limitSub")} href="/parent/settings" testId="row-limit" />
        <SettingsRow label={t("parent.row.sound")} value={[data.settings.sound ? t("parent.row.soundOn") : null, data.settings.captions ? t("parent.row.captionsOn") : null].filter(Boolean).join(" · ")} href="/parent/settings" testId="row-sound" />
        <SettingsRow label={t("parent.row.profiles")} value={String(data.childrenCount)} sub={t("parent.row.profilesSub")} href="/parent/profiles" testId="row-profiles" />
        <SettingsRow label={t("parent.row.pin")} value={data.pinSet ? t("parent.pinSet") : ""} href="/parent/pin" testId="row-pin" />
        {/* No support number configured → no help row (it used to link to this same screen: a dead control); the dashed footer says "soon". */}
        {data.whatsappHref && <SettingsRow label={t("parent.row.help")} value="" href={data.whatsappHref} testId="row-help" />}
        <SettingsRow label={t("parent.row.delete")} value="" href="/parent/delete" color="#D9643A" testId="row-delete" />
      </div>
      <div style={sx("margin-top:auto;padding-bottom:28px")}>
        {data.whatsappHref ? (
          <a href={data.whatsappHref} data-testid="whatsapp" style={sx("width:100%;height:52px;border:2px solid var(--color-success);border-radius:12px;background:var(--color-success-soft);color:var(--color-ink);font:600 18px/1.5 var(--font-body)", { display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" })}>
            {t("parent.whatsapp", { number: data.whatsapp ?? "" })}
          </a>
        ) : (
          <div data-testid="whatsapp" style={sx("width:100%;height:52px;border:2px dashed var(--color-ink-18);border-radius:12px;background:transparent;color:var(--color-ink-40);font:600 18px/1.5 var(--font-body)", { display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" })}>
            {t("parent.whatsapp", { number: t("common.soon") })}
          </div>
        )}
      </div>
    </Screen>
  );
}

/** Screens B · Parent zone — weekly report. */
export function WeeklyReportScreen({ data, frame, lang, onLang, share }: { data: ReportData; frame?: boolean; lang?: "si" | "en"; onLang?: (l: "si" | "en") => void; share?: ReactNode }) {
  useLang();
  return (
    <Screen label="Weekly report" frame={frame} root={ROOT}>
      <ParentHeader title={t("report.title")} sub={t("report.rangeChild", { range: data.range, name: data.childName })} back="/parent" lang={lang} onLang={onLang} />
      {data.sentence && (
        <div style={sx("margin-top:16px;display:flex;gap:12px;align-items:flex-start;background:var(--color-card);border-radius:16px 16px 16px 4px;padding:12px 14px")} data-testid="report-sentence">
          <ZaraCharacter state="encourage" amplitude={0} portrait size={48} />
          <span style={sx("font:400 17px/1.5 var(--font-body);color:var(--color-ink)")}>{data.sentence}</span>
        </div>
      )}
      <div style={sx("margin-top:14px;display:grid;gap:8px")}>
        <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("report.dailyMinutes")}</span>
        <div style={sx("display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:end;height:80px")} data-testid="report-bars">
          {data.bars.map((b) => (
            <div key={b.d} style={sx("display:grid;gap:4px;justify-items:center;align-content:end;height:100%")}>
              <div style={sx(`width:100%;height:${Math.max(4, (b.minutes / data.goalMinutes) * 60)}px;background:${b.minutes ? "#0F4C5C" : "rgba(27,27,27,.12)"};border-radius:6px 6px 2px 2px`)} />
              <span style={sx("font:600 16px/1 var(--font-label);color:var(--color-ink-70)")}>{b.d}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={sx("margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px")}>
        <div style={sx("background:var(--color-success-soft);border-radius:14px;padding:12px;display:grid;gap:6px")}>
          <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-success-text)")}>{t("report.confident")}</span>
          {data.confident.map((c) => (
            <span key={c} style={sx("font:500 16px/1.5 var(--font-body)")}>{c}</span>
          ))}
          {data.confident.length === 0 && <span style={sx("font:500 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("common.notYet")}</span>}
        </div>
        <div style={sx("background:var(--color-saffron-soft);border-radius:14px;padding:12px;display:grid;gap:6px")}>
          <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-saffron-text)")}>{t("report.needsWork")}</span>
          {data.needsWork.map((c) => (
            <span key={c} style={sx("font:500 16px/1.5 var(--font-body)")}>{c}</span>
          ))}
          {data.needsWork.length === 0 && <span style={sx("font:500 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("common.notYet")}</span>}
        </div>
      </div>
      <div style={sx("margin-top:14px;display:grid;gap:8px")}>
        <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("report.missed")}</span>
        {data.missed.map((m, i) => (
          <div key={i} style={sx("border:1px solid var(--color-ink-18);border-radius:12px;padding:10px 12px;display:grid;gap:4px")} data-testid="missed">
            <span style={sx("font:500 16px/1.5 var(--font-body)")}>{m.q}</span>
            <div style={sx("display:flex;gap:14px;font:400 16px/1.5 var(--font-body);white-space:nowrap")}>
              <span style={sx("color:var(--color-coral-text)")}>{t("report.gave", { a: m.a })}</span>
              <span style={sx("color:var(--color-success-text)")}>{t("report.correct", { c: m.c })}</span>
            </div>
          </div>
        ))}
        {data.missed.length === 0 && <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("common.notYet")}</span>}
      </div>
      <div style={sx("margin-top:auto;padding-bottom:28px")}>
        {share ?? <button type="button" style={sx("width:100%;height:52px;border:2px solid var(--color-ink-18);border-radius:12px;background:#fff;color:var(--color-teal);font:600 18px/1.5 var(--font-body)")}>{t("report.sharePdf")}</button>}
      </div>
    </Screen>
  );
}

/**
 * Screens B · Parent zone — subscription, profiles, data. Billing is
 * rendered from the export but marked ළඟදීම until PayHere: no invoice, no
 * card number, no next-payment date is shown as if it were real.
 */
export function SubscriptionScreen({ profiles, frame, sample, deleteButton }: { profiles: ProfilesData; frame?: boolean; /** The preview renders the export's sample plan card (a fixture, never the app). */ sample?: { next: string; method: string }; deleteButton?: ReactNode }) {
  useLang();
  return (
    <Screen label="Subscription" frame={frame} root={ROOT}>
      <div style={sx("padding-top:52px;display:flex;align-items:center;gap:10px")}>
        <BackButton href="/parent" size={44} />
        <span style={sx("font:700 24px/1.4 var(--font-display);color:var(--color-teal)")}>{t("sub.title")}</span>
      </div>
      <div style={sx("margin-top:16px;border:2px solid var(--color-teal);border-radius:16px;padding:14px 16px;display:grid;gap:6px;background:var(--color-card)")} data-testid="plan-card">
        <div style={sx("display:flex;justify-content:space-between;align-items:baseline")}>
          <span style={sx("font:700 20px/1.4 var(--font-display);white-space:nowrap")}>{t("sub.plan")}</span>
          <span style={sx("font:700 24px/1 var(--font-display);color:var(--color-teal);white-space:nowrap")}>{t("onb.4.price1")}</span>
        </div>
        <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{sample ? t("sub.nextPayment", { date: sample.next, method: sample.method }) : t("onb.4.payment") + " · " + t("common.soon")}</span>
        <span style={sx(`display:inline-flex;width:max-content;font:600 16px/1.4 var(--font-label);background:${sample ? "var(--color-success-soft)" : "var(--color-saffron-soft)"};color:${sample ? "var(--color-success-text)" : "var(--color-saffron-text)"};border-radius:999px;padding:2px 10px`)}>{sample ? t("parent.active") : t("common.soon")}</span>
      </div>
      <div style={sx("margin-top:12px;display:grid;gap:2px")}>
        <div style={sx("min-height:56px;display:flex;align-items:center;border-bottom:1px solid var(--color-ink-10);font:500 18px/1.5 var(--font-body)")}>
          <span style={sx("flex:1")}>{t("sub.switchTwo")}</span>
          <span style={sx("font:600 16px/1.5 var(--font-label);color:var(--color-teal)")}>{t("onb.4.price2")}</span>
        </div>
        <div style={sx("min-height:56px;display:flex;align-items:center;border-bottom:1px solid var(--color-ink-10);font:500 18px/1.5 var(--font-body)")}>
          <span style={sx("flex:1")}>{t("sub.changeMethod")}</span>
          <span style={sx("font:20px/1 var(--font-latin);color:var(--color-ink-40)")}>›</span>
        </div>
        <div style={sx("min-height:56px;display:flex;align-items:center;border-bottom:1px solid var(--color-ink-10);font:500 18px/1.5 var(--font-body)")}>
          <span style={sx("flex:1")}>{t("sub.history")}</span>
          <span style={sx("font:20px/1 var(--font-latin);color:var(--color-ink-40)")}>{sample ? "›" : t("common.soon")}</span>
        </div>
      </div>
      <div style={sx("margin-top:18px;font:600 16px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("parent.row.profiles")}</div>
      <div style={sx("margin-top:8px;display:grid;gap:8px")} data-testid="profiles">
        {profiles.children.map((c) => (
          <Link key={c.id} href={`/parent/profiles?child=${c.id}`} data-testid="profile-row" data-active={c.active || undefined} style={sx("display:flex;align-items:center;gap:12px;border:1px solid var(--color-ink-18);border-radius:14px;padding:10px 12px")}>
            <div style={sx("width:44px;height:44px;border-radius:50%;background:var(--color-saffron-soft);border:2px solid var(--color-saffron)")} />
            <div style={sx("flex:1;display:grid")}>
              <span style={sx("font:600 18px/1.4 var(--font-body)")}>{c.name}</span>
              <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{c.pinSet ? t("profiles.gradeLine", { grade: c.grade }) : t("common.gradeN", { n: c.grade })}</span>
            </div>
            <span style={sx("font:20px/1 var(--font-latin);color:var(--color-ink-40)")}>›</span>
          </Link>
        ))}
        <Link href="/parent/profiles/new" data-testid="add-child" style={sx("height:52px;border:2px dashed var(--color-ink-18);border-radius:14px;display:flex;align-items:center;justify-content:center;font:500 16px/1.5 var(--font-body);color:var(--color-teal)")}>
          {t("sub.addChild")}
        </Link>
      </div>
      <div style={sx("margin-top:auto;padding-bottom:28px;display:grid;gap:8px")}>
        <button type="button" disabled={!sample} style={sx("height:52px;border:2px solid var(--color-ink-18);border-radius:12px;background:#fff;color:var(--color-ink);font:600 18px/1.5 var(--font-body)", { opacity: sample ? 1 : 0.45 })}>{t("sub.cancel")}</button>
        {deleteButton ?? (
          <Link href="/parent/delete" style={sx("height:48px;border:0;border-radius:12px;background:transparent;color:var(--color-coral);font:600 16px/1.5 var(--font-body)", { display: "flex", alignItems: "center", justifyContent: "center" })}>
            {t("parent.row.delete")}
          </Link>
        )}
      </div>
    </Screen>
  );
}
