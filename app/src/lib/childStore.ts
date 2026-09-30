import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { avatarIdOf, type AvatarId } from "@/lib/avatars";
import { DEFAULT_CHAT_MINUTES, DEFAULT_DAILY_LIMIT, isChatMinutes, isDailyLimit, type ChatMinutes, type DailyLimitMinutes } from "@/lib/settings";

/**
 * The per-child fields the app shell needs beyond the lesson: the avatar
 * slot, the parent's PIN (hashed) and the settings the parent zone edits
 * (captions, sound, the daily time limit, the daily ✋ chat time).
 *
 * Home: the three columns added to `children` (supabase/schema.sql, the
 * Integration C ALTER). Until that ALTER has run on a database the same
 * object lives in a private storage bucket, one JSON per child — the
 * provenance says which store answered, so a report can never mistake the
 * fallback for the schema.
 */

export interface ChildSettings {
  captions: boolean;
  sound: boolean;
  dailyLimitMinutes: DailyLimitMinutes;
  /** The ✋ chat's daily budget (src/lib/chatBudgetRules.ts): charged by the connected second, 30 by default. */
  chatMinutes: ChatMinutes;
}

export interface ChildExtras {
  /** A stable avatar id (src/lib/avatars.ts), never the display name. */
  avatar: AvatarId | null;
  parentPinHash: string | null;
  settings: ChildSettings;
  /** Which store answered. */
  source: "columns" | "bucket" | "defaults";
}

// The limits' choices and defaults live in the settings module (src/lib/settings.ts); a parent picks among them.
export const DEFAULT_SETTINGS: ChildSettings = { captions: true, sound: true, dailyLimitMinutes: DEFAULT_DAILY_LIMIT, chatMinutes: DEFAULT_CHAT_MINUTES };

const BUCKET = "child-extras";
const MISSING_COLUMN = /column .* does not exist|schema cache/u;

function normaliseSettings(raw: unknown): ChildSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const limit = o.dailyLimitMinutes;
  return {
    captions: typeof o.captions === "boolean" ? o.captions : DEFAULT_SETTINGS.captions,
    sound: typeof o.sound === "boolean" ? o.sound : DEFAULT_SETTINGS.sound,
    dailyLimitMinutes: isDailyLimit(limit) ? limit : DEFAULT_SETTINGS.dailyLimitMinutes,
    chatMinutes: isChatMinutes(o.chatMinutes) ? o.chatMinutes : DEFAULT_SETTINGS.chatMinutes,
  };
}

async function readBucket(childId: string): Promise<Partial<ChildExtras> | null> {
  try {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(`${childId}.json`);
    if (error || !data) return null;
    return JSON.parse(await data.text()) as Partial<ChildExtras>;
  } catch {
    return null;
  }
}

async function writeBucket(childId: string, extras: Omit<ChildExtras, "source">): Promise<boolean> {
  try {
    const storage = supabaseAdmin.storage;
    const { data: buckets } = await storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) await storage.createBucket(BUCKET, { public: false });
    const body = Buffer.from(JSON.stringify(extras));
    const { error } = await storage.from(BUCKET).upload(`${childId}.json`, body, { contentType: "application/json", upsert: true });
    if (error) console.error("[childStore] bucket write failed:", error.message);
    return !error;
  } catch (error) {
    console.error("[childStore] bucket write failed:", error);
    return false;
  }
}

export async function readChildExtras(childId: string): Promise<ChildExtras> {
  const { data, error } = await supabaseAdmin.from("children").select("avatar, parent_pin_hash, settings").eq("id", childId).maybeSingle();
  if (!error && data) {
    return {
      // A stable id (src/lib/avatars.ts); a row written before the ids is read as the id its display name maps to.
      avatar: avatarIdOf(data.avatar),
      parentPinHash: typeof data.parent_pin_hash === "string" ? data.parent_pin_hash : null,
      settings: normaliseSettings(data.settings),
      source: "columns",
    };
  }
  if (error && !MISSING_COLUMN.test(error.message)) console.error("[childStore] read failed:", error.message);
  const fromBucket = await readBucket(childId);
  if (fromBucket) return { avatar: avatarIdOf(fromBucket.avatar), parentPinHash: fromBucket.parentPinHash ?? null, settings: normaliseSettings(fromBucket.settings), source: "bucket" };
  return { avatar: null, parentPinHash: null, settings: { ...DEFAULT_SETTINGS }, source: "defaults" };
}

export async function writeChildExtras(childId: string, patch: Partial<Omit<ChildExtras, "source" | "settings"> & { settings: Partial<ChildSettings> }>): Promise<ChildExtras> {
  const current = await readChildExtras(childId);
  const next: Omit<ChildExtras, "source"> = {
    avatar: patch.avatar === undefined ? current.avatar : patch.avatar,
    parentPinHash: patch.parentPinHash === undefined ? current.parentPinHash : patch.parentPinHash,
    settings: normaliseSettings({ ...current.settings, ...(patch.settings ?? {}) }),
  };
  const { error } = await supabaseAdmin.from("children").update({ avatar: next.avatar, parent_pin_hash: next.parentPinHash, settings: next.settings }).eq("id", childId);
  if (!error) return { ...next, source: "columns" };
  if (!MISSING_COLUMN.test(error.message)) console.error("[childStore] write failed:", error.message);
  const ok = await writeBucket(childId, next);
  return { ...next, source: ok ? "bucket" : "defaults" };
}

// --- the parent's PIN ------------------------------------------------------------

const PIN_SHAPE = /^\d{4}$/u;

export function pinWellFormed(pin: string): boolean {
  return PIN_SHAPE.test(pin);
}

/** PBKDF2-SHA256, 100k rounds, salted with the child id and the app secret. */
export async function hashPin(pin: string, childId: string): Promise<string> {
  const secret = (process.env.SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(`ss-pin-v1:${childId}:${secret}`), iterations: 100_000 }, key, 256);
  return Buffer.from(bits).toString("base64url");
}

export async function pinMatches(pin: string, childId: string, hash: string | null): Promise<boolean> {
  if (!hash || !pinWellFormed(pin)) return false;
  const a = Buffer.from(await hashPin(pin, childId));
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
