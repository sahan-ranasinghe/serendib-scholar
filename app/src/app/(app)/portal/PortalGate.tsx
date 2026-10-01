"use client";

import { useState } from "react";

/**
 * The password prompt. One field, once a month: a correct password sets a
 * 30-day cookie, so a recording session never opens with admin.
 */
export function PortalGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/portal/enter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (response.ok) {
      onUnlocked();
      return;
    }
    const payload = await response.json().catch(() => ({}));
    setError(
      payload?.error === "not_configured"
        ? "The portal has no password set yet — ask for PORTAL_PASSWORD to be configured."
        : "That password is not right.",
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center bg-white p-6 text-stone-900">
      <h1 className="text-xl font-bold">Zara — recording portal</h1>
      <p className="mt-1 text-sm text-stone-700">Enter the password once; this device will remember it for 30 days.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          className="rounded-lg border border-stone-400 bg-white p-3 text-stone-900"
          placeholder="Password"
        />
        <button type="submit" disabled={busy} className="rounded-lg bg-sky-700 p-3 font-bold text-white disabled:opacity-60">
          {busy ? "Checking…" : "Enter"}
        </button>
        {error && <p className="rounded bg-rose-100 p-2 text-sm text-rose-900">{error}</p>}
      </form>
    </main>
  );
}
