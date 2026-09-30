import type { MetadataRoute } from "next";
import { APP_NAME_EN, APP_NAME_SI, t } from "@/lib/appCopy";

/**
 * The web app manifest: installable, standalone (no browser chrome, so a
 * landscape session keeps the whole screen), any orientation (the session
 * locks landscape itself when installed), colours from tokens.css (teal
 * #0F4C5C, board #F7F3EA), icons drawn from the wordmark (scripts/make-icons.ts).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Latin is allowed in the manifest (the OS install dialog); the child sees the Sinhala name on the home screen.
    name: APP_NAME_EN,
    short_name: APP_NAME_SI,
    description: t("splash.tagline"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#0F4C5C",
    background_color: "#F7F3EA",
    lang: "si",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
