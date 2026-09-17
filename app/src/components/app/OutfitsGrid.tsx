"use client";

import { useState } from "react";
import LenaCharacter from "@/components/LenaCharacter";
import { ArtSlot } from "./Screen";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import type { RewardsData } from "@/lib/appTypes";

/**
 * Lena's outfits (Rewards). Each box opens a detail sheet — the outfit's
 * name, a distinct placeholder for its art, how it is earned, and its state
 * said plainly (owned / still locked, with how many concepts are left). The
 * sheet is state: closed = unmounted (cluster H, issue 24).
 */
export function OutfitsGrid({ outfits, masteredCount }: { outfits: RewardsData["outfits"]; masteredCount: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const selected = open === null ? null : outfits[open] ?? null;
  const needed = (index: number) => (index + 1) * 3;
  return (
    <>
      <div style={sx("display:grid;grid-template-columns:repeat(3,1fr);gap:10px")} data-testid="outfits">
        {outfits.map((o, i) => (
          <button
            key={o.name}
            type="button"
            onClick={() => setOpen(i)}
            data-testid="outfit"
            data-outfit={i}
            data-owned={o.owned || undefined}
            aria-haspopup="dialog"
            style={sx(`display:grid;gap:4px;justify-items:center;border:2px solid ${o.owned ? "#E9B44C" : "rgba(27,27,27,.12)"};border-radius:14px;padding:8px 4px;background:${o.owned ? "#FBEFD3" : "transparent"};min-height:96px;cursor:pointer`)}
          >
            <div style={sx("position:relative")}>
              <LenaCharacter state="idle" size={56} />
              <div data-art-slot={`outfit:${o.name}`} style={sx(`position:absolute;left:8px;top:-4px;width:28px;height:16px;border-radius:8px 8px 3px 3px;background:${o.hat};border:2px solid rgba(27,27,27,.25)`)} />
              {!o.owned && <span aria-hidden style={sx("position:absolute;right:-6px;bottom:-2px;font:16px/1 var(--font-latin)")}>🔒</span>}
            </div>
            <span style={sx(`font:700 20px/1.4 var(--font-display);color:${o.owned ? "#1B1B1B" : "rgba(27,27,27,.5)"}`)}>{o.name}</span>
          </button>
        ))}
      </div>
      {selected && open !== null && (
        <div role="dialog" aria-modal="true" aria-label={selected.name} data-testid="outfit-sheet" data-sheet="outfit" data-outfit={open} onClick={() => setOpen(null)} style={sx("position:fixed;inset:0;z-index:50;background:rgba(27,27,27,.45);display:flex;align-items:flex-end;justify-content:center")}>
          <div onClick={(e) => e.stopPropagation()} style={sx("width:100%;max-width:430px;background:var(--color-paper);border-radius:24px 24px 0 0;padding:18px 20px 28px;display:grid;gap:12px;box-shadow:var(--shadow-card)")}>
            <div style={sx("display:flex;align-items:center;gap:14px")}>
              <div style={sx("position:relative")}>
                <LenaCharacter state={selected.owned ? "hop" : "idle"} size={72} />
                <div style={sx(`position:absolute;left:12px;top:-4px;width:34px;height:18px;border-radius:9px 9px 3px 3px;background:${selected.hat};border:2px solid rgba(27,27,27,.25)`)} />
              </div>
              <div style={sx("display:grid;gap:2px")}>
                <span style={sx("font:700 24px/1.4 var(--font-display);color:var(--color-ink)")}>{selected.name}</span>
                <span data-testid="outfit-state" data-owned={selected.owned || undefined} style={sx(`font:600 20px/1.5 var(--font-label);color:${selected.owned ? "var(--color-success-text)" : "var(--color-coral-text)"}`)}>
                  {selected.owned ? t("rewards.outfitSheet.owned") : `🔒 ${t("rewards.outfitSheet.locked")}`}
                </span>
              </div>
            </div>
            <ArtSlot size="100%" label={`${t("rewards.outfitSheet.art")} · ${selected.name}`} font="12px/1.4" />
            <span style={sx("font:400 20px/1.5 var(--font-body);color:var(--color-ink)")}>{t("rewards.outfitSheet.earn", { n: needed(open) })}</span>
            {!selected.owned && <span data-testid="outfit-left" style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("rewards.outfitSheet.left", { n: Math.max(0, needed(open) - masteredCount) })}</span>}
            <button type="button" onClick={() => setOpen(null)} data-testid="outfit-close" style={sx("height:52px;border:0;border-radius:12px;background:var(--color-teal);color:#fff;font:700 22px/1.5 var(--font-display)")}>
              {t("rewards.outfitSheet.close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
