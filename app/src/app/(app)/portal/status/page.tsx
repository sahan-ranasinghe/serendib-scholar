"use client";

/**
 * /portal/status — progress, for the person who is not in the room.
 *
 * She records remotely and should not be interrupted to be asked how it is
 * going. This is the answer: counts, minutes, per-concept coverage, and
 * every line she flagged with a note — which is the part that needs a
 * reply. Same portal password, no child session.
 */
import { useCallback, useEffect, useState } from "react";
import { audio } from "@/lib/audioManager";
import type { PortalCoverage } from "../types";

interface HealthPayload {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
}

interface StatusPayload {
  coverage: PortalCoverage;
  pending: number;
  failed: number;
  minutes: number;
  rewordings: number;
  review: Array<{ id: string; group: string; text: string; clipKey: string; durationMs: number | null }>;
  rejected: Array<{ id: string; text: string; clipKey: string }>;
  notes: Array<{
    beatId: string;
    note: string;
    status: string;
    actorText: string | null;
    originalText: string;
    updatedAt: string;
  }>;
}

async function fetchStatus(): Promise<{ status: StatusPayload; health: HealthPayload | null } | { error: string }> {
  const response = await fetch("/api/portal/status");
  if (!response.ok) return { error: response.status === 401 ? "Locked — open /portal and enter the password first." : "Could not load." };
  const status = (await response.json()) as StatusPayload;
  // Health is a live round-trip through the recording path, so it is fetched alongside progress rather than on
  // demand: the first real session failed on a bucket setting nobody could see from here.
  const health = (await fetch("/api/portal/health").then((r) => r.json()).catch(() => null)) as HealthPayload | null;
  return { status, health };
}

export default function PortalStatusPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  /** Progress and the recording path's health, fetched together; state is set from the promise, never inside an effect. */
  const load = useCallback(
    () =>
      fetchStatus().then((result) => {
        if ("error" in result) setError(result.error);
        else {
          setStatus(result.status);
          setHealth(result.health);
        }
      }),
    [],
  );
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 30000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  /** A reviewer's verdict: only an approved take is served to a child (VOICE_PROFILE=human). */
  const review = async (lineId: string, verdict: "approve" | "reject") => {
    setBusy(lineId);
    await fetch("/api/portal/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_id: lineId, verdict }) }).catch(() => undefined);
    setBusy(null);
    await load();
  };

  if (error) return <main className="min-h-dvh bg-white p-8 text-sm text-stone-900">{error}</main>;
  if (!status) return <main className="min-h-dvh bg-white p-8 text-stone-700">Loading…</main>;

  const c = status.coverage;
  const pct = Math.round((c.approved / Math.max(1, c.needed)) * 100);
  return (
    <main className="mx-auto min-h-dvh max-w-3xl bg-white p-6 text-stone-900">
      <h1 className="text-2xl font-bold">Recording progress</h1>
      <p className="mt-1 text-sm text-stone-700">Distinct lines the lesson can speak, one recording each — the same count the portal and the dry run show.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" data-portal="coverage">
        {[
          { label: "lines needed", value: c.needed },
          { label: "recorded", value: c.recorded },
          { label: "approved", value: c.approved },
          { label: "minutes", value: status.minutes },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-stone-400 p-3">
            <div className="text-2xl font-bold">{tile.value}</div>
            <div className="text-xs uppercase tracking-wide text-stone-600">{tile.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>

      {(status.pending > 0 || status.failed > 0) && (
        <p className="mt-3 rounded bg-amber-50 p-3 text-sm">
          {status.pending > 0 && <>{status.pending} take(s) saved but not yet conditioned — run <code>npm run portal:process</code>. </>}
          {status.failed > 0 && <>{status.failed} upload(s) failed and are retrying.</>}
        </p>
      )}

      <h2 className="mt-6 text-lg font-semibold">Awaiting review ({status.review.length})</h2>
      <p className="mt-1 text-sm text-stone-700">Only an approved take reaches a child. A new take of a line withdraws its approval until it is heard again.</p>
      {status.review.length === 0 && <p className="mt-2 text-sm text-stone-700">Nothing waiting.</p>}
      <ul className="mt-2 space-y-2" data-portal="review">
        {status.review.map((line) => (
          <li key={line.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-300 p-3 text-sm" data-review-line={line.id}>
            <span className="min-w-0 flex-1">
              <span className="font-mono text-xs text-stone-600">{line.group} · {line.id}</span>
              <span className="block">{line.text}</span>
            </span>
            <button type="button" className="rounded-lg border border-stone-400 px-3 py-1.5" onClick={() => void audio.playUrl(`/api/portal/clip/${line.clipKey}`, `review ${line.id}`)}>
              ▶ Play
            </button>
            <button type="button" disabled={busy === line.id} data-review="approve" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-white disabled:opacity-50" onClick={() => void review(line.id, "approve")}>
              Approve
            </button>
            <button type="button" disabled={busy === line.id} data-review="reject" className="rounded-lg border border-rose-600 px-3 py-1.5 text-rose-800 disabled:opacity-50" onClick={() => void review(line.id, "reject")}>
              Reject
            </button>
          </li>
        ))}
      </ul>
      {status.rejected.length > 0 && <p className="mt-2 text-sm text-rose-800">{status.rejected.length} take(s) rejected — waiting to be recorded again.</p>}

      <h2 className="mt-6 text-lg font-semibold">Recording path</h2>
      {!health && <p className="mt-2 text-sm text-stone-700">Checking…</p>}
      {health && (
        <ul className="mt-2 space-y-1 text-sm" data-portal="health">
          {health.checks.map((check) => (
            <li
              key={check.name}
              className={`rounded p-2 ${check.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}
            >
              <span className="font-mono text-xs">{check.ok ? "OK  " : "FAIL"}</span> <b>{check.name}</b> — {check.detail}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-6 text-lg font-semibold">By group</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {c.groups.map((row) => (
          <li key={row.group} className="flex items-center gap-3">
            <span className="w-40 font-mono text-xs text-stone-900">{row.group}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full bg-sky-500" style={{ width: `${(row.approved / Math.max(1, row.needed)) * 100}%` }} />
            </div>
            <span className="w-40 text-right font-mono text-xs">{row.recorded} rec · {row.approved} ok / {row.needed}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Lines she flagged ({status.notes.length})</h2>
      {status.notes.length === 0 && <p className="mt-2 text-sm text-stone-700">Nothing flagged.</p>}
      <ul className="mt-2 space-y-3">
        {status.notes.map((note) => (
          <li key={note.beatId} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
            <div className="font-mono text-xs text-stone-700">
              {note.beatId} · {note.status} · {new Date(note.updatedAt).toLocaleString()}
            </div>
            <p className="mt-1 font-medium">“{note.note}”</p>
            <p className="mt-1 text-stone-700">script: {note.originalText}</p>
            {note.actorText && <p className="mt-1 text-emerald-800">hers: {note.actorText}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
