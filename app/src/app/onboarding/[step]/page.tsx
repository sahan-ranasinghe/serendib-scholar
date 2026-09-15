import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OnboardingClient } from "@/components/app/OnboardingClient";
import { resolveSmsProvider } from "@/lib/sms";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  const n = Number(step);
  if (![1, 2, 3, 4].includes(n)) notFound();
  // Step 1's state follows the SMS gateway (src/lib/sms.ts): none → the dev notice; one → send → code → one resend.
  const jar = await cookies();
  const cookieHeader = jar.getAll().map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
  const smsMode = resolveSmsProvider(cookieHeader) ? "provider" : "dev";
  return <OnboardingClient step={n as 1 | 2 | 3 | 4} stub={(process.env.DEV_ONBOARDING ?? "").trim() === "stub"} smsMode={smsMode} />;
}
