import { execSync } from "node:child_process";
import type { NextConfig } from "next";

/**
 * The build's identity, baked in at build time so a running app can say
 * exactly which code it is: the git short SHA (plus "+dirty" when the tree
 * had uncommitted changes) and the moment the build ran. A deploy can
 * override them at runtime with BUILD_SHA / BUILD_TIME — see
 * src/lib/buildInfo.ts, which is what everything reads.
 */
function gitSha(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
    return `${sha}${dirty ? "+dirty" : ""}`;
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  env: {
    SS_BUILD_SHA: gitSha(),
    SS_BUILD_TIME: new Date().toISOString(),
  },
  // Lets the dev server accept requests from a phone on the same LAN
  // (e.g. testing mic capture on an actual device) without the
  // "cross origin request detected" warning/block.
  allowedDevOrigins: ["192.168.150.75"],
};

export default nextConfig;
