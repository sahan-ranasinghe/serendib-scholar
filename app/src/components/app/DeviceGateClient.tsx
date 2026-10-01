"use client";

import { useEffect, useState } from "react";
import { AccessCodeGate } from "./AccessCodeGate";
import { ensureSession } from "@/lib/clientSession";
import { afterGate } from "@/cms/routes";

/** Where this device was going when the proxy stopped it — only ever somewhere inside the panel (afterGate). */
const destination = (): string => afterGate(new URLSearchParams(window.location.search).get("next"));

/**
 * The device gate for the CMS panel: the same access-code entry the lesson and onboarding show (AccessCodeGate,
 * /api/session-start), and nothing else on the page. A device that already holds the grant never sees it — it is
 * sent straight on. A full page load either way: the panel has its own root layout.
 */
export function DeviceGateClient() {
  const [locked, setLocked] = useState<{ wrong: boolean } | null>(null);
  useEffect(() => {
    void ensureSession().then((r) => {
      if (r.status === "ok") window.location.replace(destination());
      else setLocked({ wrong: r.status === "locked" && r.wrong });
    });
  }, []);
  return (
    <main data-testid="device-gate" style={{ minHeight: "100dvh", background: "var(--color-paper)" }}>
      {locked && <AccessCodeGate wrong={locked.wrong} onUnlocked={() => window.location.replace(destination())} />}
    </main>
  );
}
