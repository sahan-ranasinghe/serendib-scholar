import { NextResponse } from "next/server";
import { getActiveChild } from "@/lib/activeChild";

/**
 * The client's view of who is present — only what the UI/runtime needs
 * (currently the address gender). Identity itself stays server-side.
 */
export async function POST() {
  const child = await getActiveChild();
  return NextResponse.json({ ok: true, gender: child.gender, display_name: child.displayName });
}
