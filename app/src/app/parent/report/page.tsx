import { WeeklyReportScreen } from "@/components/app/screens/ParentZone";
import { loadChildState, reportData } from "@/lib/appData";

export default async function ReportPage() {
  const state = await loadChildState();
  return <WeeklyReportScreen data={reportData(state)} />;
}
