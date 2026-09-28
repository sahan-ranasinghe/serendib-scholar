"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppState } from "@/lib/appStore";
import { ChildChip, initialOf } from "./screens/Home";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import { postJson } from "@/lib/clientSession";

/**
 * The home header's child: avatar and name, and a tap opens the switcher —
 * every child on this device, the one sitting here marked, and "add a
 * child". Picking one makes it the active child (/api/child/switch, no PIN:
 * the children share a device), drops the other child's cached screens and
 * fetches this one's.
 */
export function ChildSwitcher({ name, kids }: { name: string; kids: Array<{ id: string; name: string; grade: number; active: boolean }> }) {
  const router = useRouter();
  const { clear, refresh } = useAppState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const pick = async (id: string, active: boolean) => {
    if (active) {
      setOpen(false);
      return;
    }
    setBusy(id);
    const r = await postJson("/api/child/switch", { child_id: id });
    if (r.ok) {
      clear();
      await refresh();
      router.refresh();
    }
    setBusy(null);
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={`${name} · ${t("home.switchChild")}`} data-testid="child-switcher-open" style={sx("border:0;background:transparent;padding:0;min-width:0")}>
        <ChildChip name={name} />
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={t("home.switchChild")} data-testid="child-switcher-sheet" data-sheet="child-switcher" data-tap onClick={() => setOpen(false)} style={sx("position:fixed;inset:0;z-index:50;background:rgba(27,27,27,.45);display:flex;align-items:flex-end;justify-content:center")}>
          <div onClick={(e) => e.stopPropagation()} style={sx("width:100%;max-width:480px;background:var(--color-paper);border-radius:24px 24px 0 0;padding:16px 20px 28px;display:grid;gap:10px;box-sizing:border-box;max-height:80dvh;overflow:auto")}>
            <div style={sx("display:flex;align-items:center;justify-content:space-between;gap:12px")}>
              <span style={sx("font:700 24px/1.5 var(--font-display);color:var(--color-ink)")}>{t("home.switchChild")}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} data-testid="child-switcher-close" style={sx("width:56px;height:56px;border:0;border-radius:50%;background:var(--color-ink-10);font:600 24px/1 var(--font-latin);color:var(--color-ink);flex:none")}>
                ×
              </button>
            </div>
            {kids.map((k) => (
              <button key={k.id} type="button" onClick={() => void pick(k.id, k.active)} disabled={busy !== null} aria-pressed={k.active} data-testid="switch-child" data-child={k.id} data-busy={busy === k.id || undefined} style={sx(`min-height:64px;border:2px solid ${k.active ? "var(--color-saffron)" : "var(--color-ink-18)"};border-radius:14px;background:${k.active ? "var(--color-saffron-soft)" : "var(--color-card)"};display:flex;align-items:center;gap:12px;padding:8px 14px;text-align:left;opacity:${busy && busy !== k.id ? 0.5 : 1}`)}>
                <span style={sx("width:44px;height:44px;border-radius:50%;background:var(--color-saffron-soft);border:2px solid var(--color-saffron);display:flex;align-items:center;justify-content:center;font:700 20px/1 var(--font-display);color:var(--color-ink);flex:none")}>{initialOf(k.name)}</span>
                <span style={sx("flex:1;min-width:0;display:grid")}>
                  <span style={sx("font:700 22px/1.5 var(--font-display);color:var(--color-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{k.name}</span>
                  <span style={sx("font:600 20px/1.4 var(--font-label);color:var(--color-ink-70)")}>{t("common.gradeN", { n: k.grade })}</span>
                </span>
                <span style={sx("font:600 22px/1 var(--font-latin);color:var(--color-teal)")}>{k.active ? "✓" : "›"}</span>
              </button>
            ))}
            <Link href="/parent/profiles/new" data-testid="switcher-add-child" style={sx("min-height:60px;border:2px dashed var(--color-ink-18);border-radius:14px;display:flex;align-items:center;justify-content:center;font:700 20px/1.5 var(--font-display);color:var(--color-teal)")}>
              {t("home.addChild")}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
