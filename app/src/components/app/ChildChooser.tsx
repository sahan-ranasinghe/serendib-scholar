"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import { postJson } from "@/lib/clientSession";

/**
 * "Switch child" on the splash: a device with more than one child picks
 * who is sitting down. Tapping a name makes that child active
 * (/api/child/switch) and goes home. Labelled with the export's
 * "දරුවන්ගේ පැතිකඩ"; the names come from the children table.
 */
export function ChildChooser({ kids }: { kids: Array<{ id: string; name: string; grade: number; active: boolean }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const pick = async (id: string) => {
    setBusy(id);
    const r = await postJson("/api/child/switch", { child_id: id });
    setBusy(null);
    if (r.ok) router.push("/home");
  };
  return (
    <div data-testid="child-chooser" style={sx("display:grid;gap:8px")}>
      <div style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("parent.row.profiles")}</div>
      {kids.map((k) => (
        <button key={k.id} type="button" onClick={() => void pick(k.id)} disabled={busy !== null} data-testid="choose-child" data-child={k.id} data-active={k.active || undefined} style={sx(`height:56px;border:${k.active ? "2px solid var(--color-saffron)" : "2px solid var(--color-ink-18)"};border-radius:12px;background:${k.active ? "var(--color-saffron-soft)" : "var(--color-paper)"};color:var(--color-ink);font:700 24px/1.5 var(--font-display)`, { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", opacity: busy && busy !== k.id ? 0.5 : 1 })}>
          <span>{k.name}</span>
          <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("common.gradeN", { n: k.grade })}</span>
        </button>
      ))}
    </div>
  );
}
