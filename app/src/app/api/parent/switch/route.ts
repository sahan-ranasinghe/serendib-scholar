import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { childCookieHeader, mintChildCookie } from "@/lib/parentAuth";
import { parentGuard } from "../_guard";

/** Make another of this parent's children the active one on this device. */
export async function POST(request: NextRequest) {
  const guard = await parentGuard(request);
  if (guard instanceof NextResponse) return guard;
  const body = await request.json().catch(() => ({}));
  const target = typeof body.child_id === "string" ? body.child_id : "";
  if (!target) return NextResponse.json({ ok: false, error: "child_id required" }, { status: 400 });
  const { data: me } = await supabaseAdmin.from("children").select("parent_contact").eq("id", guard.childId).maybeSingle();
  const { data: other } = await supabaseAdmin.from("children").select("id, parent_contact").eq("id", target).maybeSingle();
  if (!other || (other.id !== guard.childId && (!me?.parent_contact || other.parent_contact !== me.parent_contact))) {
    return NextResponse.json({ ok: false, error: "not_your_child" }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", childCookieHeader(await mintChildCookie(other.id)));
  return response;
}
