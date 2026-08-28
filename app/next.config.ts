import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Lets the dev server accept requests from a phone on the same LAN
  // (e.g. testing mic capture on an actual device) without the
  // "cross origin request detected" warning/block.
  allowedDevOrigins: ["192.168.150.75"],
};

export default nextConfig;
