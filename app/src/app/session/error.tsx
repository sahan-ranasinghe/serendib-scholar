"use client";

import { EdgeState } from "@/components/app/EdgeState";

/** The designed error state — never a stack trace. The error itself goes to the console only. */
export default function SessionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (typeof console !== "undefined") console.error("[session] route error:", error.digest ?? error.message);
  return <EdgeState kind="error" onCta={reset} altHref="/home" style={{ minHeight: "100dvh" }} />;
}
