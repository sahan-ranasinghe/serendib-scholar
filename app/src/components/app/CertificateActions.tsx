"use client";

import { useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "./Screen";
import { t } from "@/lib/appCopy";

/**
 * "බෙදාගන්න" shares the page where the browser can (or copies the link);
 * "මුද්‍රණය (A4)" prints the sheet (print CSS hides the shell). Both answer
 * the tap on the button itself (cluster H: every tap responds at once) —
 * the system share / print sheet may take a moment to appear.
 */
export function CertificateActions() {
  const [note, setNote] = useState<"sharing" | "copied" | "printing" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flash = (next: "sharing" | "copied" | "printing", ms = 1400) => {
    setNote(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), ms);
  };
  const share = async () => {
    flash("sharing");
    try {
      if (navigator.share) await navigator.share({ title: t("cert.heading"), url: location.href });
      else {
        await navigator.clipboard?.writeText(location.href);
        flash("copied", 1800);
        return;
      }
    } catch {
      /* dismissed, or no share / clipboard here: the pressed state still shows for its moment */
    }
  };
  const print = () => {
    flash("printing");
    // Let the pressed state paint before the print dialog freezes the page.
    setTimeout(() => window.print(), 60);
  };
  return (
    <>
      <SecondaryButton height={56} onClick={() => void share()} testId="cert-share" busy={note === "sharing" || note === "copied"}>
        {note === "sharing" ? t("cert.sharing") : note === "copied" ? t("cert.copied") : t("cert.share")}
      </SecondaryButton>
      <PrimaryButton height={56} font="700 22px/1.5 var(--font-display)" onClick={print} testId="cert-print" busy={note === "printing"}>
        {note === "printing" ? t("cert.printing") : t("cert.print")}
      </PrimaryButton>
    </>
  );
}
