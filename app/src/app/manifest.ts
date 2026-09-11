import type { MetadataRoute } from "next";

/**
 * The web app manifest: installable, standalone (no browser chrome, so a
 * landscape session keeps the whole screen), any orientation (the session
 * locks landscape itself when installed), colours from tokens.css (teal
 * #0F4C5C, board #F7F3EA), icons drawn from the wordmark (scripts/make-icons.ts).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Serendib Scholar",
    short_name: "සෙරෙන්ඩිබ් ශිෂ්‍ය",
    description: "ඔයාගේම ගුරුතුමිය, ඔයාගේ ෆෝන් එකේ",
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
