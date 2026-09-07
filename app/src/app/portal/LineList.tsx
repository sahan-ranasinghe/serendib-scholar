"use client";

import type { PortalLine } from "./types";

/**
 * Every line with its status, so she can jump back to a beat she wants to
 * re-record without scrolling through the session. Also the honest answer
 * to "how much is left" — a status here is only "kept" once the upload
 * actually landed.
 */
const STATUS: Record<string, { dot: string; label: string }> = {
  saved: { dot: "bg-emerald-500", label: "kept" },
  pending_processing: { dot: "bg-sky-500", label: "kept (processing)" },
  uploading: { dot: "bg-amber-400", label: "uploading" },
  failed: { dot: "bg-rose-500", label: "failed" },
};

export function LineList({
  lines,
  index,
  onPick,
}: {
  lines: PortalLine[];
  index: number;
  onPick: (index: number) => void;
}) {
  return (
    <ol className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-stone-300 bg-white text-sm">
      {lines.map((line, i) => {
        const status = line.take ? STATUS[line.take.status] : null;
        const needsReview = line.lineStatus === "rejected" || (line.note ? true : false);
        return (
          <li key={line.id}>
            <button
              type="button"
              onClick={() => onPick(i)}
              className={`flex w-full items-center gap-2 border-b border-stone-100 px-3 py-2 text-left ${
                i === index ? "bg-sky-50" : ""
              }`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status?.dot ?? "bg-stone-300"}`} />
              <span className="w-10 shrink-0 font-mono text-xs text-stone-400">{i + 1}</span>
              <span className="flex-1 truncate">{line.canonicalText}</span>
              {line.branchLabel && <span className="shrink-0 rounded bg-indigo-100 px-1 text-xs text-indigo-800">{line.branchLabel}</span>}
              {needsReview && <span className="shrink-0 rounded bg-amber-100 px-1 text-xs text-amber-800">needs review</span>}
              <span className="w-24 shrink-0 text-right text-xs text-stone-400">{status?.label ?? "not recorded"}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
