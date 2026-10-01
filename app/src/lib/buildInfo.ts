/**
 * Which build is this? The git short SHA and the build time, baked in by
 * next.config.mjs and overridable at runtime (BUILD_SHA / BUILD_TIME) so a
 * deploy — or a harness standing in for one — can say what it is serving.
 *
 * The page carries its own identity in a <meta> tag (src/app/(app)/layout.tsx);
 * /api/build reports the server's. When they differ the page is running
 * older code than the server now serves, and the update banner appears
 * (src/components/app/UpdateBanner.tsx) — the answer to "was the phone on
 * a stale service-worker cache?".
 */
export interface BuildInfo {
  sha: string;
  time: string;
}

export function buildInfo(): BuildInfo {
  const sha = (process.env.BUILD_SHA ?? "").trim() || process.env.SS_BUILD_SHA || "unknown";
  const time = (process.env.BUILD_TIME ?? "").trim() || process.env.SS_BUILD_TIME || "";
  return { sha, time };
}

/** "1cead91 · 16 Sep 14:03" — what the splash footer and the debug overlay print. */
export function buildStamp(info: BuildInfo): string {
  if (!info.time) return info.sha;
  const when = new Date(info.time);
  if (Number.isNaN(when.getTime())) return info.sha;
  const stamp = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(when);
  return `${info.sha} · ${stamp}`;
}
