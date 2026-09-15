"use client";

import { useRouter } from "next/navigation";
import { PrimaryButton } from "./Screen";
import { t } from "@/lib/appCopy";

/** The splash's "පටන් ගමු": marks that the app has been opened once (the install prompt never shows on a first open) and goes on — to onboarding on a device with no child, else home. */
export function SplashStart({ href = "/home" }: { href?: string }) {
  const router = useRouter();
  return (
    <PrimaryButton
      height={56}
      testId="splash-start"
      onClick={() => {
        try {
          const opens = Number(localStorage.getItem("ss:opens") ?? "0") + 1;
          localStorage.setItem("ss:opens", String(opens));
        } catch {
          /* private mode */
        }
        router.push(href);
      }}
    >
      {t("common.start")}
    </PrimaryButton>
  );
}
