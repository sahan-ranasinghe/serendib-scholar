"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Screen } from "./Screen";
import { ParentHeader, SettingsRow } from "./screens/ParentZone";
import { PinBoxes } from "./PinGate";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import { postJson } from "@/lib/clientSession";
import type { ChildSettings, ProfilesData } from "@/lib/appTypes";

const ROOT = "background:#FFFDF8;display:flex;flex-direction:column;padding:0 20px";
const LABEL = "font:600 16px/1.5 var(--font-label);color:var(--color-ink-70)";
const PRIMARY = "height:52px;border:2px solid var(--color-teal);border-radius:12px;background:var(--color-card);color:var(--color-teal);font:600 18px/1.5 var(--font-body)";

/** Daily limit (15 · 20 · 30), sound and captions — the parent's settings, saved as they change. */
export function SettingsClient({ settings: initial, source }: { settings: ChildSettings; source: string }) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const save = async (patch: Partial<ChildSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const r = await postJson<{ ok: boolean; source: string }>("/api/parent/settings", patch);
    setSaved(r.ok ? (r.json?.source ?? source) : "error");
  };
  const choice = (on: boolean) => (on ? "flex:1;height:52px;border:2px solid var(--color-saffron);background:var(--color-saffron-soft);border-radius:12px;display:flex;align-items:center;justify-content:center;font:700 24px/1 var(--font-display)" : "flex:1;height:52px;border:2px solid var(--color-ink-18);border-radius:12px;display:flex;align-items:center;justify-content:center;font:700 24px/1 var(--font-display)");
  return (
    <Screen label="Parent settings" root={ROOT}>
      <ParentHeader title={t("parent.row.limit")} back="/parent" />
      <div style={sx("display:grid;gap:14px;margin-top:16px")}>
        <div style={sx("display:grid;gap:6px")}>
          <span style={sx(LABEL)}>{t("parent.row.limitSub")}</span>
          <div style={sx("display:flex;gap:10px")} data-testid="limit-choices">
            {([15, 20, 30] as const).map((m) => (
              <div key={m} role="button" data-limit={m} data-selected={settings.dailyLimitMinutes === m || undefined} onClick={() => void save({ dailyLimitMinutes: m })} style={sx(choice(settings.dailyLimitMinutes === m))}>
                {m}
              </div>
            ))}
          </div>
        </div>
        <div style={sx("display:grid;gap:2px;margin-top:8px")}>
          <span style={sx(LABEL)}>{t("parent.row.sound")}</span>
          <SettingsRow label={t("parent.row.soundOn").replace(" ✓", "")} value={settings.sound ? "✓" : ""} onClick={() => void save({ sound: !settings.sound })} chevron={false} testId="toggle-sound" />
          <SettingsRow label={t("parent.row.captionsOn").replace(" ✓", "")} value={settings.captions ? "✓" : ""} onClick={() => void save({ captions: !settings.captions })} chevron={false} testId="toggle-captions" />
        </div>
        {saved && <span data-testid="settings-saved" data-source={saved} style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{saved === "error" ? t("session.connectFail") : "✓"}</span>}
      </div>
    </Screen>
  );
}

/**
 * Create, change or reset the PIN. `create`: the parent zone's first
 * screen when no PIN exists (new + again; saving it unlocks the zone).
 * Otherwise the current one, the new one, the new one again — and a
 * reset path for a forgotten PIN: the device's access code clears it, and
 * the zone asks to create one again.
 */
export function PinChangeClient({ pinSet, create = false }: { pinSet: boolean; create?: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "saved" | "wrong" | "error">("idle");
  const [resetOpen, setResetOpen] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const ready = pin.length === 4 && again === pin && (!pinSet || current.length === 4);
  const submit = async () => {
    if (!ready) return;
    setState("busy");
    const r = await postJson<{ ok: boolean; error?: string }>("/api/parent/pin", { current, pin });
    if (r.ok) {
      setState("saved");
      setTimeout(() => (create ? router.refresh() : router.push("/parent")), 800);
    } else setState(r.json?.error === "wrong_pin" ? "wrong" : "error");
  };
  const reset = async () => {
    setState("busy");
    const r = await postJson<{ ok: boolean; error?: string }>("/api/parent/pin", { reset: true, access_code: accessCode });
    if (r.ok) {
      setState("idle");
      setResetOpen(false);
      router.refresh();
    } else setState(r.json?.error === "wrong_code" ? "wrong" : "error");
  };
  return (
    <Screen label={create ? "Create PIN" : "Change PIN"} root={ROOT}>
      <ParentHeader title={create ? t("parent.title") : t("parent.row.pin")} back={create ? "/home" : "/parent"} sub={pinSet ? t("parent.pinSet") : undefined} />
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} style={sx("display:grid;gap:14px;margin-top:16px")} data-testid={create ? "pin-create" : "pin-change"}>
        {pinSet && (
          <div style={sx("display:grid;gap:6px")}>
            <span style={sx(LABEL)}>PIN</span>
            <PinBoxes value={current} onChange={setCurrent} active testId="pin-current" />
          </div>
        )}
        <div style={sx("display:grid;gap:6px")}>
          <span style={sx(LABEL)}>PIN ·</span>
          <PinBoxes value={pin} onChange={setPin} active={!pinSet} testId="pin-new" />
        </div>
        <div style={sx("display:grid;gap:6px")}>
          <span style={sx(LABEL)}>PIN · ·</span>
          <PinBoxes value={again} onChange={setAgain} active={false} testId="pin-again" />
        </div>
        {state === "wrong" && <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-coral-text)")}>{t("parent.pinWrong")}</span>}
        {state === "error" && <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-coral-text)")}>{t("session.connectFail")}</span>}
        {state === "saved" && <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-success-text)")} data-testid="pin-saved">{t("parent.pinSet")}</span>}
        <button type="submit" disabled={!ready || state === "busy"} data-testid="pin-change-submit" style={sx("height:56px;border:0;border-radius:12px;background:var(--color-teal);color:#fff;font:700 24px/1.5 var(--font-display);box-shadow:var(--shadow-button)", { opacity: ready ? 1 : 0.45 })}>
          {t("onb.next")}
        </button>
      </form>
      {pinSet && !resetOpen && (
        <button type="button" onClick={() => setResetOpen(true)} data-testid="pin-reset-open" style={sx("margin-top:12px;height:48px;border:0;border-radius:12px;background:transparent;color:var(--color-coral);font:600 16px/1.5 var(--font-body)")}>
          {t("parent.row.pin")} · {t("gate.title")}
        </button>
      )}
      {pinSet && resetOpen && (
        <form onSubmit={(e) => { e.preventDefault(); void reset(); }} style={sx("display:grid;gap:10px;margin-top:16px;border-top:1px solid var(--color-ink-10);padding-top:14px")} data-testid="pin-reset">
          <span style={sx(LABEL)}>{t("gate.title")}</span>
          <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("gate.sub")}</span>
          <input type="password" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} data-testid="pin-reset-code" style={sx("height:56px;border:2px solid var(--color-ink-18);border-radius:12px;background:#fff;padding:0 14px;font:700 22px/1 var(--font-latin);letter-spacing:0.2em;color:var(--color-ink)", { boxSizing: "border-box" })} />
          <button type="submit" disabled={!accessCode.trim() || state === "busy"} data-testid="pin-reset-submit" style={sx("height:52px;border:0;border-radius:12px;background:var(--color-coral);color:#fff;font:600 18px/1.5 var(--font-body)", { opacity: accessCode.trim() ? 1 : 0.45 })}>
            {t("parent.row.pin")}
          </button>
        </form>
      )}
    </Screen>
  );
}

/** "ගිණුම සහ දත්ත මකන්න" — a coral confirmation that really deletes the child's rows. */
export function DeleteClient({ childName }: { childName: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [result, setResult] = useState<Record<string, number | string> | null>(null);
  const run = async () => {
    setState("busy");
    const r = await postJson<{ ok: boolean; deleted: Record<string, number | string> }>("/api/parent/delete", {});
    setResult(r.json?.deleted ?? null);
    if (r.ok) {
      setState("done");
      setTimeout(() => router.push("/"), 1500);
    } else setState("error");
  };
  return (
    <Screen label="Delete account" root={ROOT}>
      <ParentHeader title={t("parent.row.delete")} back="/parent" sub={childName} />
      <div style={sx("display:flex;gap:12px;align-items:flex-start;background:var(--color-card);border-radius:14px;padding:12px 14px;margin-top:16px")}>
        <span style={sx("width:32px;height:32px;border-radius:50%;background:#D9643A;color:#fff;display:flex;align-items:center;justify-content:center;font:700 16px/1 var(--font-latin);flex:none")}>3</span>
        <div style={sx("display:grid;gap:2px")}>
          <span style={sx("font:700 20px/1.4 var(--font-display);color:var(--color-ink)")}>{t("onb.3.c3.t")}</span>
          <span style={sx("font:400 17px/1.5 var(--font-body);color:var(--color-ink-70)")}>{t("onb.3.c3.d")}</span>
        </div>
      </div>
      {result && (
        <div data-testid="delete-result" style={sx("margin-top:12px;font:400 14px/1.5 var(--font-latin);color:var(--color-ink-70)")}>
          {Object.entries(result).map(([k, v]) => (
            <div key={k}>
              {k}: {String(v)}
            </div>
          ))}
        </div>
      )}
      <div style={sx("margin-top:auto;padding-bottom:28px;display:grid;gap:8px")}>
        <button type="button" onClick={() => void run()} disabled={state === "busy" || state === "done"} data-testid="delete-confirm" style={sx("height:52px;border:0;border-radius:12px;background:var(--color-coral);color:#fff;font:600 18px/1.5 var(--font-body)")}>
          {t("parent.row.delete")}
        </button>
        <a href="/parent" style={sx(PRIMARY, { display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" })}>
          {t("onb.4.skip")}
        </a>
      </div>
    </Screen>
  );
}

/** The children this parent looks after; tapping one makes it the active child on this device. */
export function ProfilesClient({ profiles }: { profiles: ProfilesData }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const pick = async (id: string) => {
    setBusy(id);
    const r = await postJson("/api/parent/switch", { child_id: id });
    setBusy(null);
    if (r.ok) router.refresh();
  };
  return (
    <Screen label="Profiles" root={ROOT}>
      <ParentHeader title={t("parent.row.profiles")} back="/parent" />
      <div style={sx("margin-top:16px;display:grid;gap:8px")} data-testid="profiles">
        {profiles.children.map((c) => (
          <div key={c.id} role="button" onClick={() => void pick(c.id)} data-testid="profile-row" data-active={c.active || undefined} style={sx(`display:flex;align-items:center;gap:12px;border:${c.active ? "2px solid var(--color-saffron)" : "1px solid var(--color-ink-18)"};border-radius:14px;padding:10px 12px;background:${c.active ? "var(--color-saffron-soft)" : "transparent"};opacity:${busy === c.id ? 0.6 : 1}`)}>
            <div style={sx("width:44px;height:44px;border-radius:50%;background:var(--color-saffron-soft);border:2px solid var(--color-saffron)")} />
            <div style={sx("flex:1;display:grid")}>
              <span style={sx("font:600 18px/1.4 var(--font-body)")}>{c.name}</span>
              <span style={sx("font:400 16px/1.5 var(--font-body);color:var(--color-ink-70)")}>{c.pinSet ? t("profiles.gradeLine", { grade: c.grade }) : t("common.gradeN", { n: c.grade })}</span>
            </div>
            <span style={sx("font:20px/1 var(--font-latin);color:var(--color-ink-40)")}>{c.active ? "✓" : "›"}</span>
          </div>
        ))}
        <a href="/parent/profiles/new" data-testid="add-child" style={sx("height:52px;border:2px dashed var(--color-ink-18);border-radius:14px;display:flex;align-items:center;justify-content:center;font:500 16px/1.5 var(--font-body);color:var(--color-teal)")}>
          {t("sub.addChild")}
        </a>
      </div>
    </Screen>
  );
}
