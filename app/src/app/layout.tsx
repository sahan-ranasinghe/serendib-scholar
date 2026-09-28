import type { Metadata, Viewport } from "next";
import { Pwa } from "@/components/app/Pwa";
import { SingleFire } from "@/components/app/SingleFire";
import { UpdateBanner } from "@/components/app/UpdateBanner";
import { AppStateProvider } from "@/lib/appStore";
import { AppStateBadge } from "@/components/app/AppStateBadge";
import { buildInfo } from "@/lib/buildInfo";
import { Abhaya_Libre, Gemunu_Libre, Inter, Yaldevi } from "next/font/google";
import "./tokens.css";
import "./fonts.css";
import "./globals.css";
import { APP_NAME_EN, APP_NAME_SI } from "@/lib/appCopy";

// The design's four families (tokens.css → --font-display / body / label /
// latin), self-hosted by next/font. Inter is for parent-zone English only.
const gemunu = Gemunu_Libre({ variable: "--font-gemunu", weight: ["400", "700"], subsets: ["sinhala", "latin"] });
const abhaya = Abhaya_Libre({ variable: "--font-abhaya", weight: ["400", "500"], subsets: ["sinhala", "latin"] });
const yaldevi = Yaldevi({ variable: "--font-yaldevi", weight: ["400", "600"], subsets: ["sinhala", "latin"] });
const inter = Inter({ variable: "--font-inter", weight: ["400", "600", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: APP_NAME_EN,
  description: "ඔයාගේම ගුරුතුමිය, ඔයාගේ ෆෝන් එකේ",
  applicationName: APP_NAME_EN,
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: APP_NAME_SI },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0F4C5C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The page's own build identity travels with the HTML: the update banner
  // compares it against /api/build, and the debug overlay prints it.
  const build = buildInfo();
  return (
    <html
      lang="si"
      className={`${gemunu.variable} ${abhaya.variable} ${yaldevi.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <meta name="ss-build" content={build.sha} />
        <meta name="ss-build-time" content={build.time} />
      </head>
      <body className="min-h-full flex flex-col">
        <Pwa sha={build.sha} />
        {/* one tap, one action — on every control in the app (src/lib/singleFire.ts) */}
        <SingleFire />
        <UpdateBanner />
        <AppStateProvider>
          <AppStateBadge />
          {children}
        </AppStateProvider>
      </body>
    </html>
  );
}
