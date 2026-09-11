import { redirect } from "next/navigation";
import { HomeScreen } from "@/components/app/screens/Home";
import { StartLessonButton } from "@/components/app/StartLessonButton";
import { hasActiveChild } from "@/lib/activeChild";
import { homeData, loadChildState } from "@/lib/appData";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  const state = await loadChildState();
  const data = await homeData(state);
  return <HomeScreen data={data} start={<StartLessonButton height={56} style={{ flex: 1 }} />} />;
}
