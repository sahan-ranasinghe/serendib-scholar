import Link from "next/link";
import LenaCharacter from "@/components/LenaCharacter";
import { OutfitsGrid } from "../OutfitsGrid";
import { ArtSlot, BottomNav, Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import type { RewardsData } from "@/lib/appTypes";

/** Screens C · Rewards — sticker book, Lena outfits, certificates. */
export function RewardsScreen({ data, frame }: { data: RewardsData; frame?: boolean }) {
  return (
    <Screen label="Rewards" frame={frame} root="background:var(--color-board);display:flex;flex-direction:column">
      <div style={sx("padding:52px 20px 0;display:flex;align-items:center;gap:12px")}>
        <div style={sx("display:grid;flex:1")}>
          <span style={sx("font:700 28px/1.5 var(--font-display)")}>{t("rewards.title")}</span>
          <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("rewards.subtitle", { earned: data.earned, total: data.total, certs: data.certificates })}</span>
        </div>
        <LenaCharacter state="hop" size={56} />
      </div>
      <div style={sx("padding:14px 20px 0;display:grid;gap:14px")}>
        <div style={sx("background:var(--color-paper);border:2px solid var(--color-ink-10);border-radius:20px;padding:14px;display:grid;gap:10px;box-shadow:var(--shadow-paper)")}>
          <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("rewards.stickerBook")}</span>
          <div style={sx("display:grid;grid-template-columns:repeat(4,1fr);gap:10px")} data-testid="sticker-book">
            {data.stickers.map((b, i) => (
              <div key={i} style={sx("display:grid;gap:4px;justify-items:center")} data-earned={b.earned || undefined}>
                <div style={sx(`width:68px;height:68px;border-radius:50%;background:${b.earned ? "#FFFDF8" : "transparent"};border:${b.earned ? "3px solid #E9B44C" : "3px dashed rgba(27,27,27,.3)"};display:flex;align-items:center;justify-content:center;opacity:${b.earned ? 1 : 0.7}`)}>
                  <ArtSlot size={40} label={b.earned ? "art" : ""} />
                </div>
                <span style={sx(`font:700 20px/1.4 var(--font-display);color:${b.earned ? "#1B1B1B" : "rgba(27,27,27,.5)"}`)}>{b.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={sx("background:var(--color-paper);border:2px solid var(--color-ink-10);border-radius:20px;padding:14px;display:grid;gap:10px;box-shadow:var(--shadow-paper)")}>
          <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("rewards.outfits")}</span>
          <OutfitsGrid outfits={data.outfits} masteredCount={data.earned} />
        </div>
        {data.certificate ? (
          <Link href="/rewards/certificate" data-testid="certificate-card" style={sx("background:var(--color-saffron-soft);border:2px solid var(--color-saffron);border-radius:20px;padding:14px;display:flex;align-items:center;gap:12px")}>
            <span style={sx("width:48px;height:48px;border-radius:12px;background:var(--color-paper);border:2px solid var(--color-wood);display:flex;align-items:center;justify-content:center;font:22px/1 var(--font-latin)")}>🎓</span>
            <div style={sx("flex:1;display:grid")}>
              <span style={sx("font:700 20px/1.4 var(--font-display)")}>{t("rewards.certReady")}</span>
              <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("rewards.certShow", { concept: data.certificate.conceptTitle })}</span>
            </div>
            <span style={sx("font:20px/1 var(--font-latin);color:var(--color-ink-40)")}>›</span>
          </Link>
        ) : (
          <div data-testid="certificate-card" style={sx("border:2px dashed var(--color-ink-18);border-radius:20px;padding:14px;display:flex;align-items:center;gap:12px")}>
            <span style={sx("width:48px;height:48px;border-radius:12px;background:var(--color-paper);border:2px solid var(--color-ink-18);display:flex;align-items:center;justify-content:center;font:22px/1 var(--font-latin);opacity:.6")}>🎓</span>
            <div style={sx("flex:1;display:grid")}>
              <span style={sx("font:700 20px/1.4 var(--font-display);color:var(--color-ink-40)")}>{t("cert.title")}</span>
              <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-40)")}>{t("common.notYet")}</span>
            </div>
          </div>
        )}
      </div>
      <BottomNav active={3} />
    </Screen>
  );
}
