import "server-only";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { chatCharge, chatDay, chatHold, type ChatBudgetView } from "@/lib/chatBudgetRules";

/**
 * The ✋ chat's daily budget, kept in api_rate_limits (src/lib/rateLimit.ts's
 * table — no new schema). The rules are src/lib/chatBudgetRules.ts.
 *
 *   chat:<child>:<day>               seconds charged (and held) today
 *   chat-open:<child>:<day>:<open>   one opening's hold (count = seconds held,
 *                                    window_started_at = when it opened)
 *
 * An opening is settled by DELETING its row: only the request whose delete
 * returns the row adjusts the day — a close and an unload beacon for the same
 * chat cannot both refund it.
 *
 * DEV_MODE exempts the budget entirely (testing must not spend a child's day)
 * — unless the device carries the ss_chat_budget=enforce cookie, the harness's
 * way to exercise the real accounting on a throwaway child (DEV_MODE only,
 * like ss_sms_mock).
 *
 * FAIL-OPEN, LOUDLY, like every budget here: without the table the chat is
 * allowed and an error is logged.
 */

const dayKey = (childId: string, day: string) => `chat:${childId}:${day}`;
const openKey = (childId: string, day: string, openId: string) => `chat-open:${childId}:${day}:${openId}`;

export function devMode(): boolean {
  return (process.env.DEV_MODE ?? "").trim() === "on";
}

/** DEV_MODE: not counted — unless this device asked for the real budget (the harness). */
export function chatBudgetExempt(request: NextRequest): boolean {
  return devMode() && request.cookies.get("ss_chat_budget")?.value !== "enforce";
}

async function readDay(childId: string, day: string): Promise<number> {
  const { data, error } = await supabaseAdmin.from("api_rate_limits").select("count").eq("bucket", dayKey(childId, day)).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.count ?? 0;
}

async function writeDay(childId: string, day: string, seconds: number): Promise<void> {
  const { error } = await supabaseAdmin.from("api_rate_limits").upsert({ bucket: dayKey(childId, day), window_started_at: new Date().toISOString(), count: Math.max(0, Math.round(seconds)) }, { onConflict: "bucket" });
  if (error) throw new Error(error.message);
}

export function view(limitSeconds: number, usedSeconds: number, exempt = false): ChatBudgetView {
  return { exempt, limitSeconds, usedSeconds, remainingSeconds: exempt ? limitSeconds : Math.max(0, limitSeconds - usedSeconds) };
}

/** Today's budget as it stands. */
export async function chatBudgetStatus(childId: string, limitSeconds: number): Promise<ChatBudgetView> {
  try {
    return view(limitSeconds, await readDay(childId, chatDay()));
  } catch (error) {
    console.error(`[chatBudget] status unavailable: ${String(error).slice(0, 140)}`);
    return view(limitSeconds, 0);
  }
}

export type ChatOpening = { allowed: true; openId: string | null; allowedSeconds: number; budget: ChatBudgetView } | { allowed: false; budget: ChatBudgetView };

/** An opening: hold what it may use, or refuse it (too little left today). */
export async function openChatBudget(childId: string, limitSeconds: number): Promise<ChatOpening> {
  const day = chatDay();
  try {
    const used = await readDay(childId, day);
    const hold = chatHold(limitSeconds - used);
    if (hold === null) {
      console.warn(`[chatBudget] 429 chat budget spent: child=${childId} used=${used}/${limitSeconds}s`);
      return { allowed: false, budget: view(limitSeconds, used) };
    }
    const openId = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("api_rate_limits").insert({ bucket: openKey(childId, day, openId), window_started_at: new Date().toISOString(), count: hold });
    if (error) throw new Error(error.message);
    await writeDay(childId, day, used + hold);
    return { allowed: true, openId: `${day}:${openId}`, allowedSeconds: hold, budget: view(limitSeconds, used + hold) };
  } catch (error) {
    console.error(`[chatBudget] budget unavailable — ALLOWING the chat (run the api_rate_limits DDL in supabase/schema.sql): ${String(error).slice(0, 140)}`);
    return { allowed: true, openId: null, allowedSeconds: Math.min(limitSeconds, 600), budget: view(limitSeconds, 0) };
  }
}

export interface ChatSettlement {
  heldSeconds: number;
  chargedSeconds: number;
  refundedSeconds: number;
  budget: ChatBudgetView;
}

/**
 * Settles an opening: `reportedSeconds` of connected time (null: the chat never started — the token could not be
 * minted — and the whole hold goes back). Null when the opening is unknown or already settled.
 */
export async function settleChatBudget(childId: string, openId: string, reportedSeconds: number | null, limitSeconds: number): Promise<ChatSettlement | null> {
  const [day, id] = openId.split(":");
  if (!day || !id || !/^\d{4}-\d{2}-\d{2}$/u.test(day)) return null;
  try {
    const { data, error } = await supabaseAdmin.from("api_rate_limits").delete().eq("bucket", openKey(childId, day, id)).select("count, window_started_at");
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0] as { count: number; window_started_at: string } | undefined;
    if (!row) return null;
    const held = row.count;
    const elapsed = (Date.now() - new Date(row.window_started_at).getTime()) / 1000;
    const charged = reportedSeconds === null ? 0 : chatCharge(reportedSeconds, held, elapsed);
    const used = await readDay(childId, day);
    const after = Math.max(0, used - (held - charged));
    await writeDay(childId, day, after);
    return { heldSeconds: held, chargedSeconds: charged, refundedSeconds: held - charged, budget: view(limitSeconds, day === chatDay() ? after : await readDay(childId, chatDay())) };
  } catch (error) {
    console.error(`[chatBudget] could not settle ${openId}: ${String(error).slice(0, 140)}`);
    return null;
  }
}
