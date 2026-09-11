"use client";

import { PrimaryButton, SecondaryButton } from "./Screen";
import { t } from "@/lib/appCopy";

/** "බෙදාගන්න" shares the page where the browser can; "මුද්‍රණය (A4)" prints the sheet (print CSS hides the shell). */
export function CertificateActions() {
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: t("cert.heading"), url: location.href });
      else await navigator.clipboard?.writeText(location.href);
    } catch {
      /* dismissed */
    }
  };
  return (
    <>
      <SecondaryButton height={56} onClick={() => void share()} testId="cert-share">
        {t("cert.share")}
      </SecondaryButton>
      <PrimaryButton height={56} font="700 22px/1.5 var(--font-display)" onClick={() => window.print()} testId="cert-print">
        {t("cert.print")}
      </PrimaryButton>
    </>
  );
}
