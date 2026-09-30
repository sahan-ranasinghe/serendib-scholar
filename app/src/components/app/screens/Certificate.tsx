import ZaraCharacter from "@/components/ZaraCharacter";
import { BackButton, Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import type { CertificateData } from "@/lib/appTypes";

/** Screens C · Certificate — printable A4 preview. `actions` are the caller's share/print buttons. */
/** cert.body, with the concept's name in the display face: the template split at its {concept} hole. */
function certBody(grade: number, concept: string) {
  const [before = "", after = ""] = t("cert.body", { grade }).split("{concept}");
  return (
    <>
      {before}
      <b style={sx("font-family:var(--font-display)")}>{concept}</b>
      {after}
    </>
  );
}

export function CertificateScreen({ data, frame, actions }: { data: CertificateData; frame?: boolean; actions?: React.ReactNode }) {
  return (
    <Screen label="Certificate" frame={frame} root="background:var(--color-board);display:flex;flex-direction:column;align-items:center">
      <div className="app-no-print" style={sx("padding:52px 20px 0;display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box")}>
        <BackButton href="/rewards" />
        <span style={sx("font:700 28px/1.5 var(--font-display)")}>{t("cert.title")}</span>
      </div>
      <div className="certificate-sheet" data-testid="certificate" style={sx("margin-top:18px;width:330px;height:466px;background:#FFFDF8;border:10px solid var(--color-wood);box-shadow:var(--shadow-lift);position:relative;display:flex;flex-direction:column;align-items:center;padding:26px 22px;box-sizing:border-box;text-align:center")}>
        <svg viewBox="0 0 300 420" style={sx("position:absolute;inset:6px;width:calc(100% - 12px);height:calc(100% - 12px)")} preserveAspectRatio="none">
          <path d="M6 8C90 4 210 6 294 8c3 100 3 300 0 404-84 4-204 2-288 0C3 308 3 108 6 8z" fill="none" stroke="#E9B44C" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-teal);white-space:nowrap")}>{t("brand.wordmarkSi")}</div>
        <div style={sx("font:700 26px/1.4 var(--font-display);color:var(--color-ink);margin-top:4px;white-space:nowrap")}>{t("cert.heading")}</div>
        <div style={sx("margin:14px 0 8px")}>
          <ZaraCharacter state="celebrate" amplitude={0} portrait size={64} />
        </div>
        <div style={sx("font:400 20px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("cert.certifies")}</div>
        <div style={sx("font:700 34px/1.4 var(--font-display);color:var(--color-teal)")} data-testid="certificate-name">{data.name}</div>
        <div style={sx("font:400 20px/1.5 var(--font-body);color:var(--color-ink);text-wrap:balance;margin-top:4px")}>
          {data.conceptTitle ? (
            <>
              {certBody(data.grade, data.conceptTitle)}
            </>
          ) : (
            <span style={sx("color:var(--color-ink-40)")}>{t("common.notYet")}</span>
          )}
        </div>
        <div style={sx("font-size:26px;line-height:1;color:var(--color-saffron);letter-spacing:-1px;margin-top:10px")}>{data.conceptTitle ? "★★★" : ""}</div>
        <div style={sx("margin-top:auto;display:flex;justify-content:space-between;width:100%;align-items:flex-end")}>
          <div style={sx("display:grid;gap:2px;text-align:left")}>
            <span style={sx("font:400 20px/1.4 var(--font-body);color:var(--color-ink-70)")}>{data.date}</span>
          </div>
          <div style={sx("display:grid;gap:2px;text-align:right")}>
            <svg viewBox="0 0 120 30" width="100" height="25" data-art-slot="certificate-seal">
              <path d="M4 22c10-14 18-14 22-4s10 6 18-6 12 0 16 6 12-2 18-10 10 4 16 6 12-4 20-8" fill="none" stroke="#0F4C5C" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span style={sx("font:400 20px/1.4 var(--font-body);color:var(--color-ink-70)")}>{t("brand.zaraTeacher")}</span>
          </div>
        </div>
      </div>
      <div className="app-no-print" style={sx("margin-top:auto;width:100%;padding:0 20px 28px;display:grid;grid-template-columns:1fr 1fr;gap:10px;box-sizing:border-box")}>{actions}</div>
    </Screen>
  );
}
