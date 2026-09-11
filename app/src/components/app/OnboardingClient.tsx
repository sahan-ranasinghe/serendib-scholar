"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConsentStep, OnboardingCta, OnboardingScreen, OnboardingSkip, PayStep, PhoneStep, ProfileStep } from "./screens/Onboarding";
import { AccessCodeGate } from "./AccessCodeGate";
import { sx } from "./sx";
import { AVATARS, t } from "@/lib/appCopy";
import { ensureSession, postJson } from "@/lib/clientSession";

/**
 * Parent onboarding ×4. Step 1 (OTP) and step 4 (PayHere) are stubs behind
 * DEV_ONBOARDING=stub — labelled dev-only on the screen (English, a parent
 * surface) — and without the stub they say ළඟදීම. Step 2 writes the
 * children row; step 3 stamps consent.
 */
export function OnboardingClient({ step, stub, siblingOf }: { step: 1 | 2 | 3 | 4; stub: boolean; siblingOf?: string | null }) {
  const router = useRouter();
  const [gate, setGate] = useState<{ wrong: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [seconds, setSeconds] = useState(42);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<number | null>(null);
  const [grade, setGrade] = useState<4 | 5>(5);
  const [school, setSchool] = useState("");
  const [method, setMethod] = useState<"card" | "bank">("card");

  useEffect(() => {
    void ensureSession().then((r) => {
      if (r.status === "locked") setGate({ wrong: r.wrong });
    });
  }, []);
  useEffect(() => {
    if (step !== 1) return;
    const timer = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 42)), 1000);
    return () => clearInterval(timer);
  }, [step]);

  const fail = (r: { status: number; json: unknown }) => {
    const json = r.json as { error?: string } | null;
    setError(json?.error === "not_available" ? t("common.soon") : t("session.connectFail"));
    setBusy(false);
  };
  const next = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (step === 1) {
      const r = await postJson("/api/onboarding/otp", { phone, code: otp.join("") });
      if (!r.ok) return fail(r);
      router.push("/onboarding/2");
    } else if (step === 2) {
      const r = await postJson<{ ok: boolean; child_id: string }>("/api/onboarding/profile", { name, grade, avatar: avatar === null ? null : AVATARS[avatar], school, sibling_of: siblingOf ?? undefined });
      if (!r.ok) return fail(r);
      router.push(siblingOf ? "/parent/profiles" : "/onboarding/3");
    } else if (step === 3) {
      const r = await postJson("/api/onboarding/consent", {});
      if (!r.ok) return fail(r);
      router.push("/onboarding/4");
    } else {
      // The stub "starts the free week" by going home; no payment exists to take.
      router.push("/home");
    }
  };

  const devLabel = stub && (step === 1 || step === 4) ? <span data-testid="dev-stub" style={sx("text-align:center;font:600 12px/1.5 var(--font-latin);color:var(--color-ink-40)")}>DEV ONLY — {step === 1 ? "OTP stub: any 6 digits continue" : "PayHere stub: no payment is taken"}</span> : null;
  const otpActive = otp.findIndex((v) => !v);
  const canNext = step === 1 ? phone.replace(/\D/gu, "").length >= 9 && otp.every(Boolean) && stub : step === 2 ? name.trim().length > 0 : step === 3 ? true : stub;
  const cta = ONBOARDING_CTA[step - 1]!;

  if (gate) return <AccessCodeGate wrong={gate.wrong} onUnlocked={() => setGate(null)} />;
  return (
    <OnboardingScreen
      step={step}
      cta={
        <>
          {error && <span style={sx("text-align:center;font:400 16px/1.5 var(--font-body);color:var(--color-coral-text)")} data-testid="onb-error">{error}</span>}
          {devLabel}
          <OnboardingCta label={stub || (step !== 1 && step !== 4) ? cta : `${cta} · ${t("common.soon")}`} onClick={() => void next()} disabled={!canNext || busy} testId="onb-next" />
        </>
      }
      skip={step === 4 ? <OnboardingSkip label={t("onb.4.skip")} href="/home" /> : undefined}
    >
      {step === 1 && <PhoneStep phone={phone} otp={otp} otpActive={otpActive === -1 ? 5 : otpActive} resendSeconds={seconds} onPhone={setPhone} onOtp={(i, v) => setOtp((o) => o.map((x, j) => (j === i ? v : x)))} />}
      {step === 2 && <ProfileStep name={name} avatarIndex={avatar} grade={grade} school={school} onName={setName} onAvatar={setAvatar} onGrade={setGrade} onSchool={setSchool} />}
      {step === 3 && <ConsentStep />}
      {step === 4 && <PayStep method={method} onMethod={setMethod} />}
    </OnboardingScreen>
  );
}

const ONBOARDING_CTA = [t("onb.next"), t("onb.next"), t("onb.3.cta"), t("onb.4.cta")];
