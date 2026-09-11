import { notFound, redirect } from "next/navigation";
import { LessonDetailScreen } from "@/components/app/screens/LessonDetail";
import { StartLessonButton } from "@/components/app/StartLessonButton";
import { PrimaryButton } from "@/components/app/Screen";
import { hasActiveChild } from "@/lib/activeChild";
import { lessonDetailData, loadChildState } from "@/lib/appData";
import { t } from "@/lib/appCopy";

export const dynamic = "force-dynamic";

export default async function LessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  const { id } = await params;
  const state = await loadChildState();
  const data = lessonDetailData(state, Number(id));
  if (!data) notFound();
  const cta = data.ctaSession ? (
    <StartLessonButton height={60} label={t("detail.cta", { n: data.ctaSession })} style={{ width: "100%" }} />
  ) : (
    <PrimaryButton height={60} href="/practice" style={{ width: "100%" }}>
      {t("practice.title")}
    </PrimaryButton>
  );
  return <LessonDetailScreen data={data} cta={cta} />;
}
