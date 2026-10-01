import { OnboardingClient } from "@/components/app/OnboardingClient";
import { getActiveChildId } from "@/lib/activeChild";

// The sibling row hangs off the device's active child (a cookie): rendered per request, never prerendered.
export const dynamic = "force-dynamic";

/** "+ දෙවැනි දරුවා එක් කරන්න" — the profile step again, creating a sibling row. */
export default async function NewChildPage() {
  const siblingOf = await getActiveChildId();
  return <OnboardingClient step={2} stub={(process.env.DEV_ONBOARDING ?? "").trim() === "stub"} siblingOf={siblingOf} />;
}
