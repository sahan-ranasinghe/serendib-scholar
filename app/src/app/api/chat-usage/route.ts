import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/sessionAuth";
import { readChildExtras } from "@/lib/childStore";
import { chatBudgetExempt, chatBudgetStatus, settleChatBudget, view } from "@/lib/chatBudget";

/**
 * The ✋ chat's time, settled (28 Sep 2026; src/lib/chatBudgetRules.ts).
 *
 *   POST { openId, seconds }  the chat closed after `seconds` connected — sent on close, and by navigator.sendBeacon
 *                             on unload (a text/plain body); an opening settles once, the second report is a no-op.
 *   GET                       today's budget, for the debug overlay.
 */
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const raw = await request.text().catch(() => "");
  let body: { openId?: unknown; seconds?: unknown } = {};
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  const limitSeconds = (await readChildExtras(session.child_id)).settings.chatMinutes * 60;
  if (typeof body.openId !== "string" || !body.openId) return NextResponse.json({ ok: true, settled: false, budget: view(limitSeconds, 0, chatBudgetExempt(request)) });
  const seconds = typeof body.seconds === "number" ? body.seconds : 0;
  const settled = await settleChatBudget(session.child_id, body.openId, seconds, limitSeconds);
  if (!settled) return NextResponse.json({ ok: true, settled: false, budget: await chatBudgetStatus(session.child_id, limitSeconds) });
  return NextResponse.json({ ok: true, settled: true, reportedSeconds: seconds, heldSeconds: settled.heldSeconds, chargedSeconds: settled.chargedSeconds, refundedSeconds: settled.refundedSeconds, budget: settled.budget });
}

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const limitSeconds = (await readChildExtras(session.child_id)).settings.chatMinutes * 60;
  if (chatBudgetExempt(request)) return NextResponse.json({ ok: true, budget: view(limitSeconds, 0, true) });
  return NextResponse.json({ ok: true, budget: await chatBudgetStatus(session.child_id, limitSeconds) });
}
