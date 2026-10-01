"use client";

import { EdgeState } from "@/components/app/EdgeState";

/** The app's error state (Screens B · Error): Zara, two buttons, no stack trace. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (typeof console !== "undefined") console.error("[app] route error:", error.digest ?? error.message);
  return <EdgeState kind="error" onCta={reset} altHref="/home" style={{ minHeight: "100dvh" }} />;
}
