import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * The per-child fields the app shell needs beyond the lesson: the avatar
 * slot, the parent's PIN (hashed) and the settings the parent zone edits
 * (captions, sound, the daily time limit).
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
  dailyLimitMinutes: 15 | 20 | 30;
}

export interface ChildExtras {
  avatar: string | null;
  parentPinHash: string | null;
  settings: ChildSettings;
  /** Which store answered. */
  source: "columns" | "bucket" | "defaults";
}

export const DEFAULT_SETTINGS: ChildSettings = { captions: true, sound: true, dailyLimitMinutes: 15 };

const BUCKET = "child-extras";
const MISSING_COLUMN = /column .* does not exist|schema cache/u;

function normaliseSettings(raw: unknown): ChildSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const limit = o.dailyLimitMinutes;
  return {
    captions: typeof o.captions === "boolean" ? o.captions : DEFAULT_SETTINGS.captions,
    sound: typeof o.sound === "boolean" ? o.sound : DEFAULT_SETTINGS.sound,
    dailyLimitMinutes: limit === 15 || limit === 20 || limit === 30 ? limit : DEFAULT_SETTINGS.dailyLimitMinutes,
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
      avatar: typeof data.avatar === "string" ? data.avatar : null,
      parentPinHash: typeof data.parent_pin_hash === "string" ? data.parent_pin_hash : null,
      settings: normaliseSettings(data.settings),
      source: "columns",
    };
  }
  if (error && !MISSING_COLUMN.test(error.message)) console.error("[childStore] read failed:", error.message);
  const fromBucket = await readBucket(childId);
  if (fromBucket) return { avatar: fromBucket.avatar ?? null, parentPinHash: fromBucket.parentPinHash ?? null, settings: normaliseSettings(fromBucket.settings), source: "bucket" };
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
