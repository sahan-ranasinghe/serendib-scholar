import { HandNumber } from "@/components/board/HandNumber";
import ZaraCharacter from "@/components/ZaraCharacter";
import { Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";

/** Screens A · Splash & language. The button is the caller's (it navigates). */
export function SplashScreen({ frame, start }: { frame?: boolean; start: React.ReactNode }) {
  return (
    <Screen label="Splash" frame={frame} root="background:var(--color-teal);display:flex;flex-direction:column;align-items:center;padding:0 28px;color:#fff">
      <div style={sx("margin-top:96px;display:grid;justify-items:center;gap:8px")}>
        <div data-testid="wordmark" style={sx("width:96px;height:72px;background:var(--color-board);border:6px solid var(--color-wood);border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 0 var(--color-wood-dark)")}>
          <HandNumber text="5" size={40} draw={false} registerNumbers={false} />
        </div>
        <div style={sx("font:700 44px/1.5 var(--font-display);color:#fff;margin-top:8px")}>{t("brand.wordmarkSi")}</div>
        <div style={sx("font:500 20px/1.5 var(--font-body);color:rgba(255,255,255,.85)")}>{t("splash.tagline")}</div>
      </div>
      <div style={sx("flex:1;display:flex;align-items:flex-end")}>
        <ZaraCharacter state="wave" amplitude={0} size={250} />
      </div>
      <div style={sx("width:100%;background:var(--color-paper);border-radius:20px;padding:16px;display:grid;gap:10px;box-sizing:border-box;margin-bottom:28px;box-shadow:var(--shadow-lift)")}>
        <div style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("splash.language")}</div>
        <div style={sx("display:flex;gap:8px")}>
          <div style={sx("flex:1;height:52px;border-radius:12px;background:var(--color-saffron-soft);border:2px solid var(--color-saffron);display:flex;align-items:center;justify-content:center;gap:8px;font:700 22px/1.5 var(--font-display);color:var(--color-ink)")}>
            {t("splash.sinhala")} <span style={sx("width:22px;height:22px;border-radius:50%;background:var(--color-success);color:#fff;font:700 13px/22px var(--font-latin);text-align:center")}>✓</span>
          </div>
          <div style={sx("flex:1;height:52px;border-radius:12px;border:2px dashed var(--color-ink-18);display:flex;align-items:center;justify-content:center;font:600 20px/1.5 var(--font-label);color:var(--color-ink-40)")}>{t("splash.tamilSoon")}</div>
        </div>
        {start}
      </div>
    </Screen>
  );
}
