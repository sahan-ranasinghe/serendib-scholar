// @ts-check
import { execSync } from "node:child_process";
import { withPayload } from "@payloadcms/next/withPayload";

/**
 * The build's identity, baked in at build time so a running app can say
 * exactly which code it is: the git short SHA (plus "+dirty" when the tree
 * had uncommitted changes) and the moment the build ran. A deploy can
 * override them at runtime with BUILD_SHA / BUILD_TIME — see
 * src/lib/buildInfo.ts, which is what everything reads.
 */
function gitSha() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
    return `${sha}${dirty ? "+dirty" : ""}`;
  } catch {
    return "unknown";
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SS_BUILD_SHA: gitSha(),
    SS_BUILD_TIME: new Date().toISOString(),
  },
  // Lets the dev server accept requests from a phone on the same LAN
  // (e.g. testing mic capture on an actual device) without the
  // "cross origin request detected" warning/block.
  allowedDevOrigins: ["192.168.150.75"],
  // Cluster H: a prefetched route stays in the client router cache for an hour, so a tap
  // minutes later is still an instant transition (and works offline).
  experimental: {
    staleTimes: { dynamic: 120, static: 3600 },
  },
};

/**
 * Payload's Next plugin (docs/cms/SETUP.md). This file is `.mjs` because the plugin is ESM-only and the project is
 * CommonJS: `.mjs` loads on every Node the project runs on (CI is Node 20; `next.config.mts` needs Node 22.18+).
 *
 * withPayload adds three client-hint headers (Accept-CH, Vary and Critical-CH on Sec-CH-Prefers-Color-Scheme) and
 * its own X-Powered-By to EVERY route, for the panel's light/dark theme. On the app's routes those would change
 * what a child's phone is sent: `Vary` decides whether the service worker's cached shell still matches a request,
 * and `Critical-CH` makes Chromium repeat a first navigation. So they are scoped to Payload's own routes here —
 * the panel (everything under /admin except the app's QA galleries: the same list as src/cms/routes.ts
 * APP_ADMIN_PAGES, kept equal by src/lib/cmsGate.test.ts) and its API — and the app's responses keep exactly the
 * headers they had before Payload was installed.
 */
const APP_ADMIN_PAGES = ["/admin/board-gallery", "/admin/design-gallery", "/admin/design-preview"];
const appPages = APP_ADMIN_PAGES.map((page) => page.replace("/admin/", "")).join("|");
const PAYLOAD_ROUTES = ["/admin", `/admin/((?!${appPages}).*)`, "/api/payload/:path*"];
const PAYLOAD_HEADERS = new Set(["Accept-CH", "Vary", "Critical-CH"]);

const withCms = withPayload(nextConfig, { devBundleServerPackages: false });
const payloadHeaders = withCms.headers;

/** @type {import('next').NextConfig} */
const config = {
  ...withCms,
  headers: async () => {
    const rules = payloadHeaders ? await payloadHeaders() : [];
    return rules.flatMap((rule) => {
      const clientHints = rule.headers.filter((header) => PAYLOAD_HEADERS.has(header.key));
      const isPayloads = rule.source === "/:path*" && clientHints.length > 0;
      return isPayloads ? PAYLOAD_ROUTES.map((source) => ({ source, headers: clientHints })) : [rule];
    });
  },
};
// withPayload switches Next's own X-Powered-By off so it can send "Next.js, Payload" itself; the app keeps Next's default.
delete config.poweredByHeader;

export default config;
