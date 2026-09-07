"use client";

/**
 * /portal/status — progress, for the person who is not in the room.
 *
 * She records remotely and should not be interrupted to be asked how it is
 * going. This is the answer: counts, minutes, per-concept coverage, and
 * every line she flagged with a note — which is the part that needs a
 * reply. Same portal password, no child session.
 */
import { useEffect, useState } from "react";

interface StatusPayload {
  total: number;
  recorded: number;
  remaining: number;
  pending: number;
  failed: number;
  minutes: number;
  rewordings: number;
  byConcept: Array<{ concept: string; total: number; done: number }>;
  notes: Array<{
    beatId: string;
    note: string;
    status: string;
    actorText: string | null;
    originalText: string;
    updatedAt: string;
  }>;
}

export default function PortalStatusPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/portal/status");
      if (!response.ok) {
        setError(response.status === 401 ? "Locked — open /portal and enter the password first." : "Could not load.");
        return;
      }
      setStatus(await response.json());
    };
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, []);

  if (error) return <main className="p-8 text-sm">{error}</main>;
  if (!status) return <main className="p-8 text-stone-500">Loading…</main>;

  const pct = Math.round((status.recorded / Math.max(1, status.total)) * 100);
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Recording progress</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "recorded", value: `${status.recorded}/${status.total}` },
          { label: "remaining", value: status.remaining },
          { label: "minutes", value: status.minutes },
          { label: "her re-wordings", value: status.rewordings },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-stone-300 p-3">
            <div className="text-2xl font-bold">{tile.value}</div>
            <div className="text-xs uppercase tracking-wide text-stone-500">{tile.label}</div>
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

      <h2 className="mt-6 text-lg font-semibold">By concept</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {status.byConcept.map((row) => (
          <li key={row.concept} className="flex items-center gap-3">
            <span className="w-48 font-mono text-xs">{row.concept}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full bg-sky-500" style={{ width: `${(row.done / Math.max(1, row.total)) * 100}%` }} />
            </div>
            <span className="w-16 text-right font-mono text-xs">{row.done}/{row.total}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Lines she flagged ({status.notes.length})</h2>
      {status.notes.length === 0 && <p className="mt-2 text-sm text-stone-500">Nothing flagged.</p>}
      <ul className="mt-2 space-y-3">
        {status.notes.map((note) => (
          <li key={note.beatId} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
            <div className="font-mono text-xs text-stone-600">
              {note.beatId} · {note.status} · {new Date(note.updatedAt).toLocaleString()}
            </div>
            <p className="mt-1 font-medium">“{note.note}”</p>
            <p className="mt-1 text-stone-600">script: {note.originalText}</p>
            {note.actorText && <p className="mt-1 text-emerald-800">hers: {note.actorText}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
