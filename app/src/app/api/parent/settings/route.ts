import { NextRequest, NextResponse } from "next/server";
import { writeChildExtras } from "@/lib/childStore";
import { isChatMinutes, isDailyLimit } from "@/lib/settings";
import { parentGuard } from "../_guard";

/** { captions?, sound?, dailyLimitMinutes?, chatMinutes? } → the child's settings. */
export async function POST(request: NextRequest) {
  const guard = await parentGuard(request);
  if (guard instanceof NextResponse) return guard;
  const body = await request.json().catch(() => ({}));
  const settings: Record<string, unknown> = {};
  if (typeof body.captions === "boolean") settings.captions = body.captions;
  if (typeof body.sound === "boolean") settings.sound = body.sound;
  if (isDailyLimit(body.dailyLimitMinutes)) settings.dailyLimitMinutes = body.dailyLimitMinutes;
  if (isChatMinutes(body.chatMinutes)) settings.chatMinutes = body.chatMinutes;
  const written = await writeChildExtras(guard.childId, { settings });
  return NextResponse.json({ ok: true, settings: written.settings, source: written.source });
}
