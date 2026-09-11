import { redirect } from "next/navigation";
import { ProgressScreen } from "@/components/app/screens/Progress";
import { hasActiveChild } from "@/lib/activeChild";
import { loadChildState, progressData } from "@/lib/appData";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  const state = await loadChildState();
  return <ProgressScreen data={progressData(state)} />;
}
