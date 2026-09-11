import { OnboardingClient } from "@/components/app/OnboardingClient";
import { getActiveChildId } from "@/lib/activeChild";

/** "+ දෙවැනි දරුවා එක් කරන්න" — the profile step again, creating a sibling row. */
export default async function NewChildPage() {
  const siblingOf = await getActiveChildId();
  return <OnboardingClient step={2} stub={(process.env.DEV_ONBOARDING ?? "").trim() === "stub"} siblingOf={siblingOf} />;
}
