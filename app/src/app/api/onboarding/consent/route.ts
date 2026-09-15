import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireChild } from "@/lib/requireChild";

/** Onboarding step 3: "එකඟයි" stamps consent_given_at on the child. */
export async function POST() {
  const child = await requireChild();
  if (child instanceof NextResponse) return child;
  const childId = child;
  const { error } = await supabaseAdmin.from("children").update({ consent_given_at: new Date().toISOString() }).eq("id", childId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
