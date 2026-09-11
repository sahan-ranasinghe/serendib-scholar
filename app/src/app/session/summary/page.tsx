import { redirect } from "next/navigation";
import { SessionSummaryScreen } from "@/components/app/screens/SessionSummary";
import { InstallPrompt } from "@/components/app/InstallPrompt";
import { hasActiveChild } from "@/lib/activeChild";
import { loadChildState, summaryData } from "@/lib/appData";

export const dynamic = "force-dynamic";

/** `/session/summary` — what the child did in the last sitting, from the log; the install card after a completed session. */
export default async function SummaryPage() {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  const state = await loadChildState();
  const data = summaryData(state);
  return <SessionSummaryScreen data={data} extra={data.hasSession ? <InstallPrompt /> : null} />;
}
