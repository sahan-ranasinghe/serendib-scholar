import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PinGate } from "@/components/app/PinGate";
import { getActiveChildId, hasActiveChild } from "@/lib/activeChild";
import { readChildExtras } from "@/lib/childStore";
import { hasParentAccess } from "@/lib/parentAuth";

export const dynamic = "force-dynamic";

/** `/parent/*` is PIN-gated: with a PIN set and no parent cookie, every page under it shows the gate instead. */
export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  const childId = await getActiveChildId();
  const extras = await readChildExtras(childId);
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");
  const unlocked = await hasParentAccess(cookieHeader, childId);
  if (!unlocked) return <PinGate pinSet={Boolean(extras.parentPinHash)} />;
  return <>{children}</>;
}
