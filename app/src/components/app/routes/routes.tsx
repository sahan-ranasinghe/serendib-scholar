"use client";

/**
 * The child-facing routes as CLIENT screens (cluster H). Each renders from
 * the store: with a snapshot, the screen at once (a client-side transition
 * from any link, prefetched); without one, its skeleton — the same screen
 * greyed, cards and rows in place — replaced as the data lands. The pages
 * under src/app/* are thin shells around these, so their RSC payloads are
 * static and prefetchable, and no route waits on the server.
 */
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/appStore";
import { Skeleton, noDataLine } from "@/components/app/Skeleton";
import { HomeScreen } from "@/components/app/screens/Home";
import { LessonMapScreen } from "@/components/app/screens/LessonMap";
import { LessonDetailScreen } from "@/components/app/screens/LessonDetail";
import { PracticeHubScreen } from "@/components/app/screens/PracticeHub";
import { RewardsScreen } from "@/components/app/screens/Rewards";
import { ProgressScreen } from "@/components/app/screens/Progress";
import { SessionSummaryScreen } from "@/components/app/screens/SessionSummary";
import { ParentZoneScreen, WeeklyReportScreen, SubscriptionScreen } from "@/components/app/screens/ParentZone";
import { StartLessonButton } from "@/components/app/StartLessonButton";
import { SessionActions } from "@/components/app/SessionActions";
import { CertificateScreen } from "@/components/app/screens/Certificate";
import { CertificateActions } from "@/components/app/CertificateActions";
import { DeleteClient, PinChangeClient, ReportShare, SettingsClient } from "@/components/app/ParentClients";
import type { AppSnapshot } from "@/lib/appSnapshot";
import { InstallPrompt } from "@/components/app/InstallPrompt";
import { PinGate } from "@/components/app/PinGate";
import { ChildSwitcher } from "@/components/app/ChildSwitcher";
import { ProfilesClient } from "@/components/app/ParentClients";
import { PrimaryButton } from "@/components/app/Screen";
import { FIXTURE_DETAIL, FIXTURE_HOME, FIXTURE_MAP, FIXTURE_PARENT, FIXTURE_PRACTICE, FIXTURE_PROFILES, FIXTURE_PROGRESS, FIXTURE_REPORT, FIXTURE_REWARDS, FIXTURE_SUMMARY, FIXTURE_CERTIFICATE } from "@/lib/appFixtures";
import { t } from "@/lib/appCopy";

/** No child on this device: every child-facing route sends it to onboarding (the store learnt it from the server). */
function useChildGate() {
  const { noChild } = useAppState();
  const router = useRouter();
  useEffect(() => {
    if (noChild) router.replace("/onboarding/1");
  }, [noChild, router]);
}

/** Marks the real, data-backed render of a route: the harness measures "tap → interactive content" on it. */
function Ready({ route, children }: { route: string; children: ReactNode }) {
  const { status } = useAppState();
  return (
    <div data-screen-ready={route} data-store-status={status} style={{ display: "contents" }}>
      {children}
    </div>
  );
}

export function HomeRoute() {
  useChildGate();
  const { snapshot, status } = useAppState();
  if (!snapshot) {
    return (
      <Skeleton screen="home" line={noDataLine(status)}>
        <HomeScreen data={FIXTURE_HOME} start={<span style={{ flex: 1, height: 56, borderRadius: 14, background: "var(--color-ink-10)" }} />} />
      </Skeleton>
    );
  }
  return (
    <Ready route="home">
      <HomeScreen data={snapshot.home} start={<StartLessonButton height={56} style={{ flex: 1 }} />} child={<ChildSwitcher name={snapshot.home.name} kids={snapshot.kids ?? []} />} />
    </Ready>
  );
}

export function LessonsRoute() {
  useChildGate();
  const { snapshot, status } = useAppState();
  if (!snapshot) {
    return (
      <Skeleton screen="lessons" line={noDataLine(status)}>
        <LessonMapScreen data={FIXTURE_MAP} />
      </Skeleton>
    );
  }
  return (
    <Ready route="lessons">
      <LessonMapScreen data={snapshot.lessons} />
    </Ready>
  );
}

export function LessonDetailRoute({ lessonNumber }: { lessonNumber: number }) {
  useChildGate();
  const { snapshot, status } = useAppState();
  const data = snapshot?.lessonDetail[String(lessonNumber)] ?? null;
  if (!snapshot) {
    return (
      <Skeleton screen="lesson-detail" line={noDataLine(status)}>
        <LessonDetailScreen data={FIXTURE_DETAIL} cta={<span style={{ display: "block", height: 60, borderRadius: 14, background: "var(--color-ink-10)" }} />} />
      </Skeleton>
    );
  }
  if (!data) {
    return (
      <Ready route="lesson-detail">
        <LessonDetailScreen data={{ ...FIXTURE_DETAIL, lessonNumber, title: t("common.lessonN", { n: lessonNumber }), sessions: [], concepts: [], ctaSession: null, currentStarted: false }} cta={<PrimaryButton height={60} href="/lessons" style={{ width: "100%" }}>{t("nav.lessons")}</PrimaryButton>} />
      </Ready>
    );
  }
  const cta = data.ctaSession && data.currentStarted ? (
    <SessionActions lesson={data.lessonNumber} session={data.ctaSession - 1} label={t("common.sessionNth", { n: data.ctaSession })} />
  ) : data.ctaSession ? (
    <StartLessonButton height={60} label={t("detail.cta", { n: data.ctaSession })} style={{ width: "100%" }} />
  ) : (
    <PrimaryButton height={60} href="/practice" style={{ width: "100%" }}>
      {t("practice.title")}
    </PrimaryButton>
  );
  return (
    <Ready route="lesson-detail">
      <LessonDetailScreen data={data} cta={cta} />
    </Ready>
  );
}

export function PracticeRoute() {
  useChildGate();
  const { snapshot, status } = useAppState();
  if (!snapshot) {
    return (
      <Skeleton screen="practice" line={noDataLine(status)}>
        <PracticeHubScreen data={FIXTURE_PRACTICE} />
      </Skeleton>
    );
  }
  return (
    <Ready route="practice">
      <PracticeHubScreen data={snapshot.practice} />
    </Ready>
  );
}

export function RewardsRoute() {
  useChildGate();
  const { snapshot, status } = useAppState();
  if (!snapshot) {
    return (
      <Skeleton screen="rewards" line={noDataLine(status)}>
        <RewardsScreen data={FIXTURE_REWARDS} />
      </Skeleton>
    );
  }
  return (
    <Ready route="rewards">
      <RewardsScreen data={snapshot.rewards} />
    </Ready>
  );
}

export function ProgressRoute() {
  useChildGate();
  const { snapshot, status } = useAppState();
  if (!snapshot) {
    return (
      <Skeleton screen="progress" line={noDataLine(status)}>
        <ProgressScreen data={FIXTURE_PROGRESS} />
      </Skeleton>
    );
  }
  return (
    <Ready route="progress">
      <ProgressScreen data={snapshot.progress} />
    </Ready>
  );
}

/** The summary of the sitting that just ended: the lesson screen refreshes the store as it closes, so the cached copy is already this sitting's. */
export function SummaryRoute() {
  useChildGate();
  const { snapshot, status } = useAppState();
  // The cached copy renders at once (cluster H); the lesson refreshes the store as it ends, so the numbers are this sitting's by the time the route opens.
  if (!snapshot) {
    return (
      <Skeleton screen="summary" line={noDataLine(status)}>
        <SessionSummaryScreen data={FIXTURE_SUMMARY} />
      </Skeleton>
    );
  }
  return (
    <Ready route="summary">
      <SessionSummaryScreen data={snapshot.summary} extra={snapshot.summary.hasSession ? <InstallPrompt /> : null} />
    </Ready>
  );
}

/**
 * The parent zone's gate, on the client (cluster H: no server layout, so
 * every route under /parent is a prefetched client transition). No PIN yet
 * → the create-a-PIN screen; a PIN and no parent cookie → the gate; else the
 * screen, from the snapshot.
 */
function ParentGate({ route, skeleton, children }: { route: string; skeleton: ReactNode; children: (parent: NonNullable<AppSnapshot["parent"]>, snapshot: AppSnapshot) => ReactNode }) {
  useChildGate();
  const { snapshot, status } = useAppState();
  // The zone renders from the device's snapshot at once, like every screen (cluster H: a tap never waits on a fetch — on
  // Slow 3G or offline a "wait for the server" rule left the parent routes on their skeleton). The snapshot only carries
  // the zone when this device held the parent cookie at its last fetch; the revalidation behind it puts the gate up if
  // the cookie has since lapsed, and every parent WRITE is checked server-side (parentGuard) whatever the screen shows.
  if (!snapshot) {
    return (
      <Skeleton screen="parent" line={noDataLine(status)}>
        {skeleton}
      </Skeleton>
    );
  }
  if (!snapshot.pinSet) return <PinChangeClient pinSet={false} create />;
  if (!snapshot.parent) return <PinGate pinSet={snapshot.pinRequired} />;
  return <Ready route={route}>{children(snapshot.parent, snapshot)}</Ready>;
}

export function ParentRoute() {
  return (
    <ParentGate route="parent" skeleton={<ParentZoneScreen data={FIXTURE_PARENT} />}>
      {(parent) => <ParentZoneScreen data={parent.zone} />}
    </ParentGate>
  );
}

export function SettingsRoute() {
  return (
    <ParentGate route="parent-settings" skeleton={<ParentZoneScreen data={FIXTURE_PARENT} />}>
      {(parent) => <SettingsClient key={parent.settings.source + JSON.stringify(parent.settings.settings)} settings={parent.settings.settings} source={parent.settings.source} />}
    </ParentGate>
  );
}

export function PinRoute() {
  return (
    <ParentGate route="parent-pin" skeleton={<ParentZoneScreen data={FIXTURE_PARENT} />}>
      {(_parent, snapshot) => <PinChangeClient pinSet={snapshot.pinSet} />}
    </ParentGate>
  );
}

export function DeleteRoute() {
  return (
    <ParentGate route="parent-delete" skeleton={<ParentZoneScreen data={FIXTURE_PARENT} />}>
      {(_parent, snapshot) => <DeleteClient childName={snapshot.childName} />}
    </ParentGate>
  );
}

export function ReportRoute() {
  return (
    <ParentGate route="parent-report" skeleton={<WeeklyReportScreen data={FIXTURE_REPORT} />}>
      {(parent) => <WeeklyReportScreen data={parent.report} share={<ReportShare />} />}
    </ParentGate>
  );
}

export function ProfilesRoute() {
  return (
    <ParentGate route="parent-profiles" skeleton={<ProfilesClient profiles={FIXTURE_PROFILES} />}>
      {(parent) => <ProfilesClient profiles={parent.profiles} />}
    </ParentGate>
  );
}

export function SubscriptionRoute() {
  return (
    <ParentGate route="parent-subscription" skeleton={<SubscriptionScreen profiles={FIXTURE_PROFILES} />}>
      {(parent) => <SubscriptionScreen profiles={parent.profiles} />}
    </ParentGate>
  );
}

/** The certificate (A4 print sheet): from the snapshot, its actions live. */
export function CertificateRoute() {
  useChildGate();
  const { snapshot, status } = useAppState();
  if (!snapshot) {
    return (
      <Skeleton screen="certificate" line={noDataLine(status)}>
        <CertificateScreen data={FIXTURE_CERTIFICATE} />
      </Skeleton>
    );
  }
  return (
    <Ready route="certificate">
      <CertificateScreen data={snapshot.certificate} actions={<CertificateActions />} />
    </Ready>
  );
}
