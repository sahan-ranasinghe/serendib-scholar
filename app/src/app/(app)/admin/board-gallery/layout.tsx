import type { Metadata } from "next";
import { Noto_Sans_Sinhala } from "next/font/google";
import type { ReactNode } from "react";

/**
 * The board's Sinhala face. Loaded here rather than in the root layout so
 * the lesson screen can adopt it when the board is wired in, and nothing
 * else pays for it yet. board.css and theme.ts fall back to the platform
 * Sinhala faces when the variable is absent.
 */
const notoSinhala = Noto_Sans_Sinhala({
  subsets: ["sinhala"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-noto-sinhala",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Board gallery",
  robots: { index: false, follow: false },
};

export default function BoardGalleryLayout({ children }: { children: ReactNode }) {
  return <div className={notoSinhala.variable}>{children}</div>;
}
