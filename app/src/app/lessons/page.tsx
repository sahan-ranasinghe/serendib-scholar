import { redirect } from "next/navigation";
import { LessonMapScreen } from "@/components/app/screens/LessonMap";
import { hasActiveChild } from "@/lib/activeChild";
import { lessonMapData, loadChildState } from "@/lib/appData";

export const dynamic = "force-dynamic";

export default async function LessonsPage() {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  const state = await loadChildState();
  return <LessonMapScreen data={lessonMapData(state)} />;
}
