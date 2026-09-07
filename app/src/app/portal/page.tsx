"use client";

/**
 * THE VOICE ACTOR'S PORTAL.
 *
 * She works through a session line by line, for up to two hours, from
 * wherever she is — a laptop or a phone in a quiet room. Everything here
 * is in service of one thing: keeping her in flow.
 *
 *   - one line at a time, large, with the previous and next dimmed around
 *     it, so she can hear the rhythm of the passage she is in,
 *   - a 3-2-1 countdown, because being caught mid-breath costs a take,
 *   - auto-stop on 1.5s of silence, so she never reaches for a key with a
 *     held breath,
 *   - immediate playback, then keep / retake / trim,
 *   - the whole keyboard: space, enter, r, arrows. Her hands stay still.
 *
 * NOTHING LIVES ONLY IN THIS PAGE. Every kept take uploads before it is
 * counted, and the page holds no durable state of its own — reload it,
 * or open it on a different device, and it redraws from the server with
 * every saved take intact. That is why a dropped connection mid-session
 * costs at most the take in progress.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTakeRecorder } from "@/hooks/useTakeRecorder";
import { PortalGate } from "./PortalGate";
import { LineList } from "./LineList";
import { TrimEditor } from "./TrimEditor";
import { LevelMeter } from "./LevelMeter";
import type { PortalLine, UploadState } from "./types";

export default function PortalPage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [lines, setLines] = useState<PortalLine[]>([]);
  const [index, setIndex] = useState(0);
  const [loadNote, setLoadNote] = useState("Loading…");
  const [pendingTake, setPendingTake] = useState<{ blob: Blob; durationMs: number; peakDbfs: number; noiseDbfs: number } | null>(null);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [showList, setShowList] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [trim, setTrim] = useState<{ startMs: number; endMs: number | null }>({ startMs: 0, endMs: null });
  const [busy, setBusy] = useState<string | null>(null);
  const recorder = useTakeRecorder();
  const playerRef = useRef<HTMLAudioElement | null>(null);

  const current = lines[index] ?? null;

  const load = useCallback(async () => {
    const response = await fetch("/api/portal/beats");
    if (response.status === 401) {
      setUnlocked(false);
      return;
    }
    const payload = await response.json();
    setLines(payload.lines ?? []);
    setLoadNote(payload.lines?.length ? "" : (payload.note ?? "Nothing authored yet."));
    setUnlocked(true);
  }, []);

  useEffect(() => {
    void (async () => {
      const gate = await fetch("/api/portal/enter").then((r) => r.json()).catch(() => null);
      if (gate?.unlocked) await load();
      else setUnlocked(false);
    })();
  }, [load]);

  // Moving to a line loads its note and its saved trim handles, so
  // returning to an earlier line shows exactly what she left there.
  // Adjusted during render rather than in an effect: React re-renders
  // before painting, so the new line never flashes with the old line's
  // note or a stale take still offered for keeping.
  const [shownLineId, setShownLineId] = useState<string | null>(null);
  if (current && current.id !== shownLineId) {
    setShownLineId(current.id);
    setPendingTake(null);
    setNoteDraft(current.note ?? "");
    setTrim({ startMs: current.take?.trimStartMs ?? 0, endMs: current.take?.trimEndMs ?? null });
  }

  const move = useCallback(
    (delta: number) => setIndex((i) => Math.max(0, Math.min(lines.length - 1, i + delta))),
    [lines.length],
  );

  const playBlob = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    playerRef.current = audio;
    audio.onended = () => URL.revokeObjectURL(url);
    void audio.play().catch(() => URL.revokeObjectURL(url));
  }, []);

  /** Record → auto-play the take once → she decides. */
  const record = useCallback(async () => {
    if (!current || recorder.phase !== "idle") return;
    const take = await recorder.start();
    if (!take) return;
    setPendingTake(take);
    setTrim({ startMs: 0, endMs: null });
    playBlob(take.blob);
  }, [current, recorder, playBlob]);

  /**
   * Keep. The line is not marked done until the server says the audio is
   * in Storage — a "kept" line that exists only here would be a lie the
   * next reload exposes.
   */
  const keep = useCallback(
    async (take = pendingTake, line = current) => {
      if (!take || !line) return;
      setUploads((prev) => ({ ...prev, [line.id]: { state: "uploading", attempts: (prev[line.id]?.attempts ?? 0) + 1 } }));
      const form = new FormData();
      form.set("line_id", line.id);
      form.set("text", line.canonicalText);
      form.set("clip_key", line.clipKey);
      form.set("trim_start_ms", String(trim.startMs));
      if (trim.endMs != null) form.set("trim_end_ms", String(trim.endMs));
      form.set("peak_dbfs", String(take.peakDbfs));
      form.set("noise_dbfs", String(take.noiseDbfs));
      form.set("audio", take.blob, `${line.id}.webm`);
      try {
        const response = await fetch("/api/portal/take", { method: "POST", body: form });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload?.error ?? "upload failed");
        setUploads((prev) => ({ ...prev, [line.id]: { state: "saved", attempts: prev[line.id]?.attempts ?? 1 } }));
        setPendingTake(null);
        await load();
        setIndex((i) => Math.min(lines.length - 1, i + 1));
      } catch {
        // Kept in memory and retried; she is told, and the line stays
        // "not recorded" until it really is.
        setUploads((prev) => ({
          ...prev,
          [line.id]: { state: "failed", attempts: prev[line.id]?.attempts ?? 1, blob: take.blob },
        }));
      }
    },
    [pendingTake, current, trim, load, lines.length],
  );

  // Failed uploads retry on their own, backing off, so a flaky connection
  // heals without her noticing.
  useEffect(() => {
    const failed = Object.entries(uploads).filter(([, state]) => state.state === "failed" && state.blob);
    if (failed.length === 0) return;
    const timer = setTimeout(() => {
      for (const [lineId, state] of failed) {
        const line = lines.find((candidate) => candidate.id === lineId);
        if (line && state.blob) {
          void keep({ blob: state.blob, durationMs: 0, peakDbfs: 0, noiseDbfs: 0 }, line);
        }
      }
    }, Math.min(30000, 3000 * (failed[0]?.[1].attempts ?? 1)));
    return () => clearTimeout(timer);
  }, [uploads, lines, keep]);

  const playPreviousIntoCurrent = useCallback(async () => {
    const previous = lines[index - 1];
    const play = (key: string) =>
      new Promise<void>((resolve) => {
        const audio = new Audio(`/api/portal/clip/${key}`);
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        void audio.play().catch(() => resolve());
      });
    if (previous?.take?.status === "saved" && previous.take.clipKey) await play(previous.take.clipKey);
    if (pendingTake) playBlob(pendingTake.blob);
    else if (current?.take?.status === "saved" && current.take.clipKey) await play(current.take.clipKey);
  }, [lines, index, pendingTake, current, playBlob]);

  const playReference = useCallback(() => {
    if (!current) return;
    void new Audio(`/api/portal/clip/${current.clipKey}?source=ai`).play().catch(() => undefined);
  }, [current]);

  const deleteTake = useCallback(async () => {
    if (!current) return;
    setBusy("delete");
    await fetch("/api/portal/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beat_id: current.id }),
    });
    setBusy(null);
    await load();
  }, [current, load]);

  const saveNote = useCallback(async () => {
    if (!current) return;
    setBusy("note");
    await fetch("/api/portal/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beat_id: current.id, note: noteDraft, original_text: current.text }),
    });
    setBusy(null);
    await load();
  }, [current, noteDraft, load]);

  // Space / enter / r / arrows. Never while she is typing a note.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (event.key === " ") {
        event.preventDefault();
        if (recorder.phase === "recording") recorder.stop();
        else void record();
      } else if (event.key === "Enter" && pendingTake) {
        event.preventDefault();
        void keep();
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        setPendingTake(null);
        void record();
      } else if (event.key === "ArrowLeft") move(-1);
      else if (event.key === "ArrowRight") move(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recorder, record, keep, move, pendingTake]);

  const progress = useMemo(() => {
    const done = lines.filter((line) => line.take?.status === "saved").length;
    const ms = lines.reduce((sum, line) => sum + (line.take?.status === "saved" ? (line.take.durationMs ?? 0) : 0), 0);
    const byConcept = new Map<string, { total: number; done: number }>();
    for (const line of lines) {
      const entry = byConcept.get(line.concept) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (line.take?.status === "saved") entry.done += 1;
      byConcept.set(line.concept, entry);
    }
    return { done, total: lines.length, minutes: Math.round((ms / 60000) * 10) / 10, byConcept: [...byConcept] };
  }, [lines]);

  if (unlocked === null) return <main className="p-8 text-stone-500">Loading…</main>;
  if (!unlocked) return <PortalGate onUnlocked={() => void load()} />;

  const upload = current ? uploads[current.id] : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col p-4 landscape:p-3">
      <header className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => setShowList((v) => !v)} className="rounded-lg border border-stone-300 px-3 py-1.5">
          ☰ Lines
        </button>
        <span className="font-mono">
          {progress.done}/{progress.total} · {progress.minutes} min
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
        </div>
        <LevelMeter level={recorder.level} peak={recorder.peak} clipping={recorder.clipping} noisy={recorder.roomNoisy} />
      </header>

      {recorder.micError && <p className="mt-3 rounded bg-rose-100 p-3 text-sm text-rose-900">{recorder.micError}</p>}
      {recorder.clipping && <p className="mt-2 rounded bg-amber-100 px-3 py-1.5 text-sm">Peaks are clipping — move back from the mic.</p>}
      {recorder.roomNoisy && !recorder.clipping && (
        <p className="mt-2 rounded bg-amber-50 px-3 py-1.5 text-sm">Room noise is high — a blanket behind you will help.</p>
      )}
      {loadNote && <p className="mt-3 rounded bg-amber-100 p-3 text-sm">{loadNote}</p>}

      {showList && (
        <LineList
          lines={lines}
          index={index}
          onPick={(i) => {
            setIndex(i);
            setShowList(false);
          }}
        />
      )}

      {current && (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 py-4">
          <p className="max-w-2xl text-center text-base text-stone-400 line-clamp-2">{lines[index - 1]?.canonicalText ?? " "}</p>

          <div className="w-full rounded-2xl border-2 border-stone-300 bg-white p-5 text-center shadow-sm">
            <div className="mb-2 font-mono text-xs text-stone-500">
              {current.id} · {current.type} · {current.concept}
              {current.branchLabel && (
                <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-800">{current.branchLabel}</span>
              )}
            </div>
            <p className="text-2xl leading-relaxed landscape:text-xl">{current.canonicalText}</p>
            {current.numbers.length > 0 && (
              <p className="mt-2 text-xs text-stone-500">Numbers to say exactly: {current.numbers.join(", ")}</p>
            )}
          </div>

          <p className="max-w-2xl text-center text-base text-stone-400 line-clamp-2">{lines[index + 1]?.canonicalText ?? " "}</p>

          {recorder.phase === "counting" && <div className="text-6xl font-bold text-rose-500">{recorder.countdown}</div>}

          {pendingTake && (
            <TrimEditor
              blob={pendingTake.blob}
              trim={trim}
              onChange={setTrim}
              onPlay={() => playBlob(pendingTake.blob)}
            />
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            {recorder.phase === "recording" ? (
              <button type="button" onClick={recorder.stop} className="rounded-full bg-rose-600 px-6 py-3 font-bold text-white">
                ⏹ Stop <span className="opacity-70">(space)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void record()}
                disabled={recorder.phase !== "idle"}
                className="rounded-full bg-sky-600 px-6 py-3 font-bold text-white disabled:opacity-40"
              >
                ● Record <span className="opacity-70">(space)</span>
              </button>
            )}
            {pendingTake && (
              <>
                <button type="button" onClick={() => void keep()} className="rounded-full bg-emerald-600 px-5 py-3 font-bold text-white">
                  ✓ Keep <span className="opacity-70">(enter)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingTake(null);
                    void record();
                  }}
                  className="rounded-full border border-stone-400 px-5 py-3"
                >
                  ↻ Retake <span className="opacity-60">(r)</span>
                </button>
              </>
            )}
            <button type="button" onClick={() => void playPreviousIntoCurrent()} className="rounded-full border border-stone-300 px-4 py-3 text-sm">
              ▶ Previous → this
            </button>
            <button type="button" onClick={playReference} className="rounded-full border border-stone-300 px-4 py-3 text-sm">
              🔊 Reference
            </button>
            {current.take && (
              <button type="button" onClick={() => void deleteTake()} disabled={busy !== null} className="rounded-full border border-rose-300 px-4 py-3 text-sm text-rose-700">
                🗑 Delete take
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm">
            <button type="button" onClick={() => move(-1)} className="rounded border border-stone-300 px-3 py-1">←</button>
            <span className="font-mono text-stone-500">{index + 1} / {lines.length}</span>
            <button type="button" onClick={() => move(1)} className="rounded border border-stone-300 px-3 py-1">→</button>
          </div>

          <div className="w-full max-w-2xl">
            <label htmlFor="note" className="text-sm text-stone-600">
              Note for this line (awkward wording, a better phrasing…)
            </label>
            <div className="mt-1 flex gap-2">
              <textarea
                id="note"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                rows={2}
                className="flex-1 rounded-lg border border-stone-300 p-2 text-sm"
              />
              <button type="button" onClick={() => void saveNote()} disabled={busy !== null} className="rounded-lg border border-stone-400 px-3 text-sm">
                Save
              </button>
            </div>
          </div>

          <p className="text-sm">
            {upload?.state === "uploading" && <span className="text-amber-700">Uploading…</span>}
            {upload?.state === "failed" && <span className="text-rose-700">Upload failed — retrying automatically.</span>}
            {current.take?.status === "saved" && <span className="text-emerald-700">Saved ✓ {Math.round((current.take.durationMs ?? 0) / 100) / 10}s</span>}
            {current.take?.status === "pending_processing" && <span className="text-sky-700">Saved ✓ (conditioning pending)</span>}
          </p>
        </section>
      )}
    </main>
  );
}
