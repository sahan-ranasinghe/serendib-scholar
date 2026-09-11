import { redirect } from "next/navigation";
import { RewardsScreen } from "@/components/app/screens/Rewards";
import { hasActiveChild } from "@/lib/activeChild";
import { loadChildState, rewardsData } from "@/lib/appData";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  const state = await loadChildState();
  return <RewardsScreen data={rewardsData(state)} />;
}
