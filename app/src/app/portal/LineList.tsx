"use client";

import type { PortalLine } from "./types";

/**
 * Every line with its status, so she can jump back to a beat she wants to
 * re-record without scrolling through the session. Also the honest answer
 * to "how much is left" — a status here is only "kept" once the upload
 * actually landed.
 */
/**
 * Colour lives on the STATUS LABEL only. Every row's text is solid dark:
 * the panel previously rendered near-invisible grey on white, which made
 * the one screen she uses to navigate unreadable.
 */
const STATUS: Record<string, { dot: string; text: string; label: string }> = {
  approved: { dot: "bg-emerald-700", text: "text-emerald-900", label: "approved" },
  saved: { dot: "bg-emerald-600", text: "text-emerald-800", label: "kept · awaiting review" },
  rejected: { dot: "bg-rose-600", text: "text-rose-800", label: "not approved — record again" },
  pending_processing: { dot: "bg-sky-600", text: "text-sky-800", label: "kept (processing)" },
  uploading: { dot: "bg-amber-500", text: "text-amber-800", label: "uploading" },
  failed: { dot: "bg-rose-600", text: "text-rose-800", label: "failed" },
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
    <ol className="mt-3 max-h-72 w-full min-w-0 overflow-y-auto rounded-xl border border-stone-400 bg-white text-sm text-stone-900">
      {lines.map((line, i) => {
        const status = line.take ? STATUS[line.take.status] : null;
        const needsReview = line.lineStatus === "rejected" || (line.note ? true : false);
        return (
          <li key={line.id}>
            <button
              type="button"
              onClick={() => onPick(i)}
              data-portal="line-row"
              className={`flex w-full min-w-0 items-center gap-2 border-b border-stone-200 px-3 py-2 text-left text-stone-900 ${
                i === index ? "bg-sky-100" : "bg-white"
              }`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status?.dot ?? "bg-stone-400"}`} />
              <span className="w-10 shrink-0 font-mono text-xs text-stone-600">{i + 1}</span>
              <span data-portal="line-row-text" className="min-w-0 flex-1 truncate font-sinhala text-stone-900">
                {line.canonicalText}
              </span>
              {line.branchLabel && <span className="shrink-0 rounded bg-indigo-100 px-1 text-xs text-indigo-900">{line.branchLabel}</span>}
              {line.group === "number words" && (
                <span className="shrink-0 rounded bg-teal-100 px-1 text-xs text-teal-900">number word</span>
              )}
              {/* One per concept, reached from any of its questions after a second miss — not from a beat she can find it under. */}
              {line.group === "reteach" && (
                <span className="shrink-0 rounded bg-violet-100 px-1 text-xs text-violet-900">reteach</span>
              )}
              {needsReview && <span className="shrink-0 rounded bg-amber-100 px-1 text-xs text-amber-900">needs review</span>}
              <span className={`w-24 shrink-0 text-right text-xs font-medium ${status?.text ?? "text-stone-600"}`}>
                {status?.label ?? "not recorded"}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
