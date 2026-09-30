/**
 * THE ✋ CHAT'S DAILY BUDGET — the rules (28 Sep 2026). Pure: no database, no
 * request; src/lib/chatBudget.ts applies them to api_rate_limits.
 *
 * It used to charge a flat 5 minutes per OPENING against a 15-minute day, so
 * a child got three chat openings and then a silent 429 — the chat panel
 * flashed and closed. The server cannot measure a WebSocket it is not a party
 * to, so the time is settled from both sides:
 *
 *   open    the server HOLDS min(what is left today, CHAT_MAX_OPEN_SECONDS)
 *           and tells the client how long this opening may run
 *           (allowedSeconds) — the client closes the chat at that point.
 *   close   the client reports the connected seconds (on close, and by
 *           beacon on unload); the server charges
 *              clamp(min(reported, seconds since the open + slack),
 *                    CHAT_MIN_CHARGE_SECONDS, held)
 *           and gives the rest of the hold back. An opening settles once.
 *   never   a hold nobody settles (the tab killed mid-chat) stays charged —
 *   settled at most CHAT_MAX_OPEN_SECONDS: a forgotten session cannot drain the day.
 *
 * The minimum makes an open-close loop cost something; the cap bounds one
 * opening; the client cannot claim more time than has passed on the server.
 */

/** The shortest charge: opening and closing at once still costs this. */
export const CHAT_MIN_CHARGE_SECONDS = 15;
/** The longest a single opening may run (and the most an unsettled one costs). */
export const CHAT_MAX_OPEN_SECONDS = 10 * 60;
/** A reported duration may exceed the server's own clock by this much (the socket opens after the token is minted). */
export const CHAT_CLOCK_SLACK_SECONDS = 5;
/** What a parent may choose per child per day, and the default — the app's settings module (src/lib/settings.ts). */
export { CHAT_MINUTES_CHOICES, DEFAULT_CHAT_MINUTES, isChatMinutes, type ChatMinutes } from "@/lib/settings";

/** What an opening may hold, given what is left today; null when too little is left to open a chat at all. */
export function chatHold(remainingSeconds: number): number | null {
  if (remainingSeconds < CHAT_MIN_CHARGE_SECONDS) return null;
  return Math.min(CHAT_MAX_OPEN_SECONDS, Math.floor(remainingSeconds));
}

/**
 * What a settled opening costs: the connected time the client reports (never more than has passed on the server's
 * clock), at least the minimum, at most what was held.
 */
export function chatCharge(reportedSeconds: number, heldSeconds: number, serverElapsedSeconds: number): number {
  const reported = Number.isFinite(reportedSeconds) && reportedSeconds > 0 ? reportedSeconds : 0;
  const measured = Math.min(reported, Math.max(0, serverElapsedSeconds) + CHAT_CLOCK_SLACK_SECONDS);
  return Math.min(heldSeconds, Math.max(CHAT_MIN_CHARGE_SECONDS, Math.ceil(measured)));
}

/** The day a chat is charged to (UTC, as the bucket has always been keyed). */
export function chatDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** What the client and the debug overlay are told about the budget. */
export interface ChatBudgetView {
  /** DEV_MODE: not counted at all. */
  exempt: boolean;
  limitSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
}
