/**
 * Onboarding for the browser harnesses: the JS that runs INSIDE the page
 * to put a fresh child on the device the way the app's own screens do —
 * device gate (ACCESS_CODE), the OTP stub, the profile row, consent — so
 * the cookies land in the browser naturally. Used by design-check's clip
 * drill; session-check drives the real screens instead and only uses the
 * API helpers for the second child and the restart.
 */
import { copyPattern } from "./copyText";

export const ONBOARD_VIA_API_JS = (accessCode: string, name: string, siblingOf: string | null = null) => `(async () => {
  const post = async (url, body) => { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const start = await post("/api/session-start", ${JSON.stringify(accessCode)} ? { access_code: ${JSON.stringify(accessCode)} } : {});
  if (!start.json || !start.json.ok) return { ok: false, step: "session-start", status: start.status, error: start.json && start.json.error };
  if (!${JSON.stringify(Boolean(siblingOf))}) {
    // No SMS gateway is configured for the harness: step 1 takes any 4-digit code and stores the phone unverified.
    const otp = await post("/api/onboarding/otp", { action: "verify", phone: "0770000001", code: "1234" });
    if (!otp.json || !otp.json.ok) return { ok: false, step: "otp", status: otp.status, error: otp.json && otp.json.error };
  }
  const profile = await post("/api/onboarding/profile", { name: ${JSON.stringify(name)}, grade: 5, avatar: "squirrel", sibling_of: ${JSON.stringify(siblingOf)} });
  if (!profile.json || !profile.json.ok) return { ok: false, step: "profile", status: profile.status, error: profile.json && profile.json.error };
  const consent = await post("/api/onboarding/consent", {});
  const session = await post("/api/session-start", {});
  return { ok: true, child_id: profile.json.child_id, extras_source: profile.json.extras_source, consent: consent.json && consent.json.ok, settings: session.json && session.json.settings };
})()`;

/** Which packed session /home offers next ("N වෙනි සැසිය" in the continue card), read from the page's HTML. */
export const HOME_SESSION_JS = `fetch("/home").then((r) => r.text()).then((html) => { const m = new RegExp(${JSON.stringify(copyPattern("home.continueKicker"))}, "u").exec(html); return m ? { lesson: Number(m[1]), session: Number(m[2]) } : null; })`;
