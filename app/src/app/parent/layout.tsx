import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PinGate } from "@/components/app/PinGate";
import { PinChangeClient } from "@/components/app/ParentClients";
import { getActiveChildId, hasActiveChild } from "@/lib/activeChild";
import { readChildExtras } from "@/lib/childStore";
import { hasParentAccess } from "@/lib/parentAuth";

export const dynamic = "force-dynamic";

/**
 * `/parent/*` is PIN-gated. No PIN yet → the create-a-PIN screen comes
 * first (creating it unlocks the zone); a PIN set and no parent cookie →
 * the gate; the PIN page itself lets the parent change or reset it.
 */
export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  const childId = await getActiveChildId();
  const extras = await readChildExtras(childId);
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");
  if (!extras.parentPinHash) return <PinChangeClient pinSet={false} create />;
  const unlocked = await hasParentAccess(cookieHeader, childId);
  if (!unlocked) return <PinGate pinSet />;
  return <>{children}</>;
}
