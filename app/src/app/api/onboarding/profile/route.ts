import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { writeChildExtras } from "@/lib/childStore";
import { childCookieHeader, mintChildCookie } from "@/lib/parentAuth";
import { readCookie } from "@/lib/sessionAuth";
import { AVATARS } from "@/lib/appCopy";

/**
 * Onboarding step 2 (and "add a second child"): creates the row in
 * `children` — name, grade, avatar (extras), the parent's phone from step
 * 1 — and makes it this device's active child.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  const grade = body.grade === 4 || body.grade === 5 ? body.grade : null;
  const avatar = typeof body.avatar === "string" && AVATARS.includes(body.avatar) ? body.avatar : null;
  if (!name || !grade) return NextResponse.json({ ok: false, error: "name and grade required" }, { status: 400 });
  const phone = readCookie(request.headers.get("cookie"), "ss_onb_phone");
  let parentContact = phone;
  if (!parentContact && typeof body.sibling_of === "string") {
    const { data } = await supabaseAdmin.from("children").select("parent_contact").eq("id", body.sibling_of).maybeSingle();
    parentContact = data?.parent_contact ?? null;
  }
  const { data, error } = await supabaseAdmin
    .from("children")
    .insert({ display_name: name, grade, medium: "sinhala", parent_contact: parentContact })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[onboarding] children insert failed:", error?.message);
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }
  const extras = await writeChildExtras(data.id, { avatar });
  const response = NextResponse.json({ ok: true, child_id: data.id, extras_source: extras.source });
  response.headers.set("Set-Cookie", childCookieHeader(await mintChildCookie(data.id)));
  return response;
}
