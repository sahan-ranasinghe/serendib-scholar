import { NextRequest, NextResponse } from "next/server";
import { isChildOnDevice } from "@/lib/activeChild";
import { childCookieHeader, mintChildCookie } from "@/lib/parentAuth";

/**
 * The splash's "switch child": make another of this device's children the
 * active one. No PIN — the children share a device and a parent contact;
 * a child not in that group is refused.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const target = typeof body.child_id === "string" ? body.child_id : "";
  if (!target) return NextResponse.json({ ok: false, error: "child_id required" }, { status: 400 });
  if (!(await isChildOnDevice(target))) return NextResponse.json({ ok: false, error: "not_on_this_device" }, { status: 403 });
  const response = NextResponse.json({ ok: true, child_id: target });
  response.headers.set("Set-Cookie", childCookieHeader(await mintChildCookie(target)));
  return response;
}
