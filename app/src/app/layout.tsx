import type { Metadata } from "next";
import { Abhaya_Libre, Gemunu_Libre, Inter, Yaldevi } from "next/font/google";
import "./tokens.css";
import "./fonts.css";
import "./globals.css";

// The design's four families (tokens.css → --font-display / body / label /
// latin), self-hosted by next/font. Inter is for parent-zone English only.
const gemunu = Gemunu_Libre({ variable: "--font-gemunu", weight: ["400", "700"], subsets: ["sinhala", "latin"] });
const abhaya = Abhaya_Libre({ variable: "--font-abhaya", weight: ["400", "500"], subsets: ["sinhala", "latin"] });
const yaldevi = Yaldevi({ variable: "--font-yaldevi", weight: ["400", "600"], subsets: ["sinhala", "latin"] });
const inter = Inter({ variable: "--font-inter", weight: ["400", "600", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Serendib Scholar",
  description: "A voice-first AI study companion for the Grade 5 Scholarship Exam.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${gemunu.variable} ${abhaya.variable} ${yaldevi.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
