import "server-only";
import { NextResponse } from "next/server";
import { NoChildError, getActiveChildId } from "@/lib/activeChild";

/** The active child for a route handler, or a clean 409 when this device has none (never a 500). */
export async function requireChild(): Promise<string | NextResponse> {
  try {
    return await getActiveChildId();
  } catch (error) {
    if (error instanceof NoChildError) return NextResponse.json({ ok: false, error: "no_child" }, { status: 409 });
    throw error;
  }
}
