"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ConsentStep, OnboardingCta, OnboardingScreen, OnboardingSkip, PayStep, PhoneStep, ProfileStep } from "./screens/Onboarding";
import { AccessCodeGate } from "./AccessCodeGate";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import { AVATAR_IDS } from "@/lib/avatars";
import { ensureSession, postJson } from "@/lib/clientSession";
import { useAppState } from "@/lib/appStore";

/** After a send, the one resend is offered once this many seconds later — and never again. */
const RESEND_AFTER_S = 30;

const subscribeNever = () => () => {};
/** True once React has hydrated the screen (false during SSR and hydration) — the harness types only after this. */
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

/**
 * Parent onboarding ×4.
 *
 * Step 1 has two honest states (src/lib/sms.ts). No SMS gateway: a dev
 * notice, any 4-digit code, plain ඉදිරියට, the phone stored unverified.
 * A gateway: "කේතය එවන්න" is an explicit tap; the code boxes appear only
 * after the gateway accepted the send; a countdown runs ONCE from 0:30 and
 * then offers ONE resend. Nothing says "sent" unless a send succeeded.
 *
 * Step 4 (PayHere) is a stub behind DEV_ONBOARDING=stub, labelled dev-only.
 * Step 2 writes the children row; step 3 stamps consent.
 */
export function OnboardingClient({ step, stub, smsMode = "dev", siblingOf }: { step: 1 | 2 | 3 | 4; stub: boolean; smsMode?: "dev" | "provider"; siblingOf?: string | null }) {
  const { clear: clearAppState } = useAppState();
  const router = useRouter();
  const hydrated = useHydrated();
  const [gate, setGate] = useState<{ wrong: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [resend, setResend] = useState<"waiting" | "available" | "used" | null>(null);
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
  // The resend countdown: one run from 0:30 to 0:00 after a successful send; at 0:00 the single resend is offered (derived, below). It never restarts.
  useEffect(() => {
    if (resend !== "waiting" || secondsLeft === null || secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resend, secondsLeft]);
  const resendView: "waiting" | "available" | "used" | null = resend === "waiting" && secondsLeft !== null && secondsLeft <= 0 ? "available" : resend;

  const fail = (r: { status: number; json: unknown }) => {
    const json = r.json as { error?: string } | null;
    setError(json?.error === "not_available" ? t("common.soon") : t("session.connectFail"));
    setBusy(false);
  };
  const sendCode = async (again = false) => {
    if (sending) return;
    setSending(true);
    setError(null);
    const r = await postJson<{ ok: boolean; sent?: boolean; error?: string }>("/api/onboarding/otp", { action: "send", phone });
    setSending(false);
    if (!r.ok || !r.json?.sent) {
      // The gateway did not accept it: nothing pretends a code went out.
      setError(t("session.connectFail"));
      return;
    }
    if (again) setResend("used");
    else {
      setSent(true);
      setSecondsLeft(RESEND_AFTER_S);
      setResend("waiting");
    }
  };
  const next = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (step === 1) {
      const r = await postJson<{ ok: boolean; error?: string }>("/api/onboarding/otp", { action: "verify", phone, code: otp.join("") });
      if (!r.ok) {
        if (r.json?.error === "wrong_code") {
          setError(t("parent.pinWrong"));
          setOtp(["", "", "", ""]);
          setBusy(false);
          return;
        }
        return fail(r);
      }
      router.push("/onboarding/2");
    } else if (step === 2) {
      const r = await postJson<{ ok: boolean; child_id: string }>("/api/onboarding/profile", { name, grade, avatar: avatar === null ? null : (AVATAR_IDS[avatar] ?? null), school, sibling_of: siblingOf ?? undefined });
      if (!r.ok) return fail(r);
      // A new child on this device: whatever the store cached belonged to someone else.
      clearAppState();
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

  const devLabel = stub && step === 4 ? <span data-testid="dev-stub" style={sx("text-align:center;font:600 14px/1.5 var(--font-body);color:var(--color-ink-40)")}>{t("onboarding.devStub")}</span> : null;
  const otpActive = otp.findIndex((v) => !v);
  const phoneOk = phone.replace(/\D/gu, "").length >= 9;
  const canNext = step === 1 ? phoneOk && otp.every(Boolean) && (smsMode === "dev" || sent) : step === 2 ? name.trim().length > 0 : step === 3 ? true : stub;
  const cta = ONBOARDING_CTA[step - 1]!;

  if (gate) return <AccessCodeGate wrong={gate.wrong} onUnlocked={() => setGate(null)} />;
  return (
    <OnboardingScreen
      step={step}
      cta={
        <>
          {hydrated && <span data-testid="onb-hydrated" hidden />}
          {error && <span style={sx("text-align:center;font:400 16px/1.5 var(--font-body);color:var(--color-coral-text)")} data-testid="onb-error">{error}</span>}
          {devLabel}
          <OnboardingCta label={stub || step !== 4 ? cta : `${cta} · ${t("common.soon")}`} onClick={() => void next()} disabled={!canNext || busy} testId="onb-next" />
        </>
      }
      skip={step === 4 ? <OnboardingSkip label={t("onb.4.skip")} href="/home" /> : undefined}
    >
      {step === 1 && (
        <PhoneStep
          mode={smsMode}
          phone={phone}
          onPhone={setPhone}
          code={otp}
          codeActive={otpActive === -1 ? 3 : otpActive}
          onCode={(i, v) => setOtp((o) => o.map((x, j) => (j === i ? v : x)))}
          sent={sent}
          sending={sending}
          onSend={phoneOk ? () => void sendCode(false) : undefined}
          secondsLeft={secondsLeft}
          resend={resendView}
          onResend={() => void sendCode(true)}
        />
      )}
      {step === 2 && <ProfileStep name={name} avatarIndex={avatar} grade={grade} school={school} onName={setName} onAvatar={setAvatar} onGrade={setGrade} onSchool={setSchool} />}
      {step === 3 && <ConsentStep />}
      {step === 4 && <PayStep method={method} onMethod={setMethod} />}
    </OnboardingScreen>
  );
}

const ONBOARDING_CTA = [t("onb.next"), t("onb.next"), t("onb.3.cta"), t("onb.4.cta")];
