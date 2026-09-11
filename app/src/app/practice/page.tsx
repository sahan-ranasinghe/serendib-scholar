import { redirect } from "next/navigation";
import { PracticeHubScreen } from "@/components/app/screens/PracticeHub";
import { hasActiveChild } from "@/lib/activeChild";
import { loadChildState, practiceData } from "@/lib/appData";

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  const state = await loadChildState();
  return <PracticeHubScreen data={await practiceData(state)} />;
}
