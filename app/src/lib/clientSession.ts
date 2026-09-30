"use client";

import { DEFAULT_DAILY_LIMIT } from "@/lib/settings";

/**
 * The browser's side of /api/session-start: every app page that calls an
 * API needs the session cookie it mints (see proxy.ts). "locked" means
 * this device has never entered the access code — the caller shows the
 * code entry.
 */
export interface SessionStartInfo {
  settings: { captions: boolean; sound: boolean; dailyLimitMinutes: number; chatMinutes?: number };
  minutesToday: number;
}

export async function ensureSession(accessCode?: string): Promise<{ status: "ok"; info: SessionStartInfo } | { status: "locked"; wrong: boolean } | { status: "error" }> {
  try {
    const response = await fetch("/api/session-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accessCode ? { access_code: accessCode } : {}),
    });
    if (response.ok) {
      const json = await response.json();
      return { status: "ok", info: { settings: json.settings ?? { captions: true, sound: true, dailyLimitMinutes: DEFAULT_DAILY_LIMIT }, minutesToday: json.minutes_today ?? 0 } };
    }
    if (response.status === 401) {
      const payload = await response.json().catch(() => ({}));
      return { status: "locked", wrong: payload?.error === "wrong_code" };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

export async function postJson<T = unknown>(url: string, body: unknown): Promise<{ ok: boolean; status: number; json: T | null }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const json = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, status: response.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}
