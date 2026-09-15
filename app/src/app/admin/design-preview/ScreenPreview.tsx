"use client";

/**
 * /admin/design-preview?screen=<label> — one portrait app screen rendered
 * with the export's own sample data (src/lib/appFixtures.ts) at the
 * export's frame size (390×844; edge states 390×412) on the export's page
 * ground, for scripts/design-check.ts to photograph and diff against the
 * export's render of the same frame. `?screen=list` prints the labels.
 */
import { EdgeState } from "@/components/app/EdgeState";
import { PrimaryButton, SecondaryButton } from "@/components/app/Screen";
import { SplashScreen } from "@/components/app/screens/Splash";
import { HomeScreen } from "@/components/app/screens/Home";
import { LessonMapScreen } from "@/components/app/screens/LessonMap";
import { LessonDetailScreen } from "@/components/app/screens/LessonDetail";
import { SessionSummaryScreen } from "@/components/app/screens/SessionSummary";
import { PracticeHubScreen } from "@/components/app/screens/PracticeHub";
import { QuizScreen } from "@/components/app/screens/Quiz";
import { RewardsScreen } from "@/components/app/screens/Rewards";
import { CertificateScreen } from "@/components/app/screens/Certificate";
import { ProgressScreen } from "@/components/app/screens/Progress";
import { ConsentStep, OnboardingCta, OnboardingScreen, OnboardingSkip, PayStep, PhoneStep, ProfileStep, ONBOARDING_STEPS } from "@/components/app/screens/Onboarding";
import { ParentZoneScreen, SubscriptionScreen, WeeklyReportScreen } from "@/components/app/screens/ParentZone";
import { FIXTURE_CERTIFICATE, FIXTURE_DETAIL, FIXTURE_HOME, FIXTURE_MAP, FIXTURE_ONBOARDING, FIXTURE_PARENT, FIXTURE_PRACTICE, FIXTURE_PRACTICE_RINGS, FIXTURE_PROFILES, FIXTURE_PROGRESS, FIXTURE_QUIZ, FIXTURE_REPORT, FIXTURE_REWARDS, FIXTURE_SUMMARY } from "@/lib/appFixtures";
import { t } from "@/lib/appCopy";
import type { EdgeKind } from "@/lib/appTypes";

const EDGE_LABELS: Record<string, EdgeKind> = { Loading: "loading", Offline: "offline", Paused: "paused", "Rotate phone": "rotate", "Mic permission": "mic", Error: "error" };

export const SCREEN_LABELS = ["Splash", "Home", "Lesson map", "Lesson detail", "Session summary", ...ONBOARDING_STEPS.map((s) => s.label), "Parent zone", "Weekly report", "Subscription", ...Object.keys(EDGE_LABELS), "Practice hub", "Quiz", "Rewards", "Certificate", "Progress"];

function screenFor(label: string) {
  const start = (
    <PrimaryButton height={56} testId="start-lesson" style={{ flex: 1 }}>
      {t("common.start")}
    </PrimaryButton>
  );
  switch (label) {
    case "Splash":
      return <SplashScreen frame start={<PrimaryButton height={56}>{t("common.start")}</PrimaryButton>} />;
    case "Home":
      return <HomeScreen frame data={FIXTURE_HOME} start={start} />;
    case "Lesson map":
      return <LessonMapScreen frame data={FIXTURE_MAP} />;
    case "Lesson detail":
      return (
        <LessonDetailScreen frame data={FIXTURE_DETAIL} cta={<PrimaryButton height={60} style={{ width: "100%" }}>{t("detail.cta", { n: 2 })}</PrimaryButton>} />
      );
    case "Session summary":
      return <SessionSummaryScreen frame data={FIXTURE_SUMMARY} />;
    case "Practice hub":
      return <PracticeHubScreen frame data={FIXTURE_PRACTICE} rings={FIXTURE_PRACTICE_RINGS} />;
    case "Quiz":
      return <QuizScreen frame question={FIXTURE_QUIZ.question} index={FIXTURE_QUIZ.index} results={FIXTURE_QUIZ.results} selected={FIXTURE_QUIZ.selected} />;
    case "Rewards":
      return <RewardsScreen frame data={FIXTURE_REWARDS} />;
    case "Certificate":
      return (
        <CertificateScreen
          frame
          data={FIXTURE_CERTIFICATE}
          actions={
            <>
              <SecondaryButton height={56}>{t("cert.share")}</SecondaryButton>
              <PrimaryButton height={56} font="700 22px/1.5 var(--font-display)">
                {t("cert.print")}
              </PrimaryButton>
            </>
          }
        />
      );
    case "Progress":
      return <ProgressScreen frame data={FIXTURE_PROGRESS} />;
    case "Parent zone":
      return <ParentZoneScreen frame data={FIXTURE_PARENT} subscriptionValue={t("onb.4.price1")} />;
    case "Weekly report":
      return <WeeklyReportScreen frame data={FIXTURE_REPORT} />;
    case "Subscription":
      return <SubscriptionScreen frame profiles={FIXTURE_PROFILES} sample={{ next: "2026 ඔක්. 3", method: "Visa •••• 4821" }} />;
    default: {
      const step = ONBOARDING_STEPS.findIndex((s) => s.label === label);
      if (step >= 0) {
        const o = ONBOARDING_STEPS[step]!;
        const f = FIXTURE_ONBOARDING;
        return (
          <OnboardingScreen frame step={(step + 1) as 1 | 2 | 3 | 4} cta={<OnboardingCta label={o.cta} />} skip={o.skip ? <OnboardingSkip label={o.skip} /> : undefined}>
            {step === 0 && <PhoneStep mode="provider" phone={f.phone} code={f.otp} codeActive={f.otpActive} sent secondsLeft={f.resendSeconds} resend="waiting" />}
            {step === 1 && <ProfileStep name={f.name} avatarIndex={f.avatarIndex} grade={f.grade} />}
            {step === 2 && <ConsentStep />}
            {step === 3 && <PayStep method="card" />}
          </OnboardingScreen>
        );
      }
      const edge = EDGE_LABELS[label];
      if (edge) return <EdgeState kind={edge} frame showLabel />;
      return null;
    }
  }
}

export function ScreenPreview({ label }: { label: string }) {
  const screen = screenFor(label);
  if (!screen) {
    return (
      <div style={{ padding: 24, font: "14px/1.5 var(--font-latin)" }}>
        <p>Unknown screen “{label}”. Screens:</p>
        <ul>
          {SCREEN_LABELS.map((l) => (
            <li key={l}>
              <a href={`?screen=${encodeURIComponent(l)}`}>{l}</a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="app-preview-ground" data-design-screen={label}>
      {screen}
    </div>
  );
}
