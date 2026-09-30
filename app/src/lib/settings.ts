/**
 * THE APP'S SETTINGS — each written once (29 Sep 2026, docs/cms/content-inventory.md §16). Phase 2 replaces this
 * module with the CMS's global settings; until then it is the one place each value lives, and
 * src/lib/sourceAudit.test.ts fails if any of them is written a second time anywhere in the app's source.
 *
 * Pure and client-safe: screens, routes and the runtime all import it.
 */

// --- the daily lesson limit ---------------------------------------------------
/** What a parent may choose, in minutes a day. 30 by default (the device walk, 17 Sep: a 15-minute limit closed a sitting mid-abacus). */
export const DAILY_LIMIT_CHOICES = [15, 20, 30] as const;
export type DailyLimitMinutes = (typeof DAILY_LIMIT_CHOICES)[number];
export const DEFAULT_DAILY_LIMIT: DailyLimitMinutes = 30;
export function isDailyLimit(value: unknown): value is DailyLimitMinutes {
  return (DAILY_LIMIT_CHOICES as readonly unknown[]).includes(value);
}

// --- the ✋ chat's day (src/lib/chatBudgetRules.ts charges it) -------------------
/** What a parent may choose, in minutes of chat a day. */
export const CHAT_MINUTES_CHOICES = [15, 30, 60] as const;
export type ChatMinutes = (typeof CHAT_MINUTES_CHOICES)[number];
export const DEFAULT_CHAT_MINUTES: ChatMinutes = 30;
export function isChatMinutes(value: unknown): value is ChatMinutes {
  return (CHAT_MINUTES_CHOICES as readonly unknown[]).includes(value);
}

// --- progress and rewards ------------------------------------------------------
/** A concept is MASTERED at this share of correct answers (with enough answers — src/lib/appData.ts); the rings go green at it. */
export const MASTERY_PERCENT = 85;
/** How long one practice round is said to take (the practice hub and its card on home). */
export const PRACTICE_MINUTES = 3;
/** Sticker slots on the rewards page: one per mastered concept, the rest "soon". */
export const STICKER_SLOTS = 12;
/** Lena earns an outfit for every this many stickers. */
export const STICKERS_PER_OUTFIT = 3;
/** Stickers needed for outfit `index` (0 = the first). */
export function stickersForOutfit(index: number): number {
  return (index + 1) * STICKERS_PER_OUTFIT;
}
