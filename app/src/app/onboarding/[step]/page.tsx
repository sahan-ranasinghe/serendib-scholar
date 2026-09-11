import { notFound } from "next/navigation";
import { OnboardingClient } from "@/components/app/OnboardingClient";

export default async function OnboardingPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  const n = Number(step);
  if (![1, 2, 3, 4].includes(n)) notFound();
  return <OnboardingClient step={n as 1 | 2 | 3 | 4} stub={(process.env.DEV_ONBOARDING ?? "").trim() === "stub"} />;
}
