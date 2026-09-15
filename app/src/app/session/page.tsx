import { redirect } from "next/navigation";
import LessonScreen from "@/components/LessonScreen";
import { hasActiveChild } from "@/lib/activeChild";

export const dynamic = "force-dynamic";

/** `/session` — the landscape lesson (resume or session 1); a device with no child goes to onboarding first. */
export default async function SessionPage() {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  return <LessonScreen />;
}
