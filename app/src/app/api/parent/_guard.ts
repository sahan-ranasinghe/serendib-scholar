import { NextResponse } from "next/server";
import { getActiveChildId } from "@/lib/activeChild";
import { readChildExtras, type ChildExtras } from "@/lib/childStore";
import { hasParentAccess } from "@/lib/parentAuth";

/**
 * Shared by the parent routes: the active child, its extras, and whether
 * this request may act as the parent — always when no PIN has been set
 * yet, otherwise only with the PIN cookie.
 */
export async function parentGuard(request: Request): Promise<{ childId: string; extras: ChildExtras } | NextResponse> {
  const childId = await getActiveChildId();
  const extras = await readChildExtras(childId);
  if (extras.parentPinHash && !(await hasParentAccess(request.headers.get("cookie"), childId))) {
    return NextResponse.json({ ok: false, error: "pin_required" }, { status: 401 });
  }
  return { childId, extras };
}
