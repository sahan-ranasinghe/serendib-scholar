/** Shared shapes between the portal page and its parts. */

export interface PortalTake {
  status: "uploading" | "saved" | "pending_processing" | "failed";
  durationMs: number | null;
  clipKey: string | null;
  trimStartMs: number;
  trimEndMs: number | null;
  sentences: Array<{ startMs: number; endMs: number }> | null;
  peakDbfs: number | null;
}

export interface PortalLine {
  id: string;
  beatId: string;
  /** "if right" / "if wrong" for a branch line, else null. */
  branchLabel: string | null;
  /** "lesson" or "number words" — the reusable library recorded once. */
  group?: string;
  concept: string;
  type: string;
  pauseType: string | null;
  text: string;
  /** What she reads: her accepted re-wording if there is one, else the authored line. */
  canonicalText: string;
  numbers: number[];
  expectedAnswer: string | null;
  clipKey: string;
  note: string | null;
  lineStatus: string | null;
  actorText: string | null;
  take: PortalTake | null;
}

/**
 * The upload's own state, held separately from the line: a take is only
 * "saved" when the server says so, and the blob is retained while a retry
 * is outstanding so a failure never costs the recording.
 */
export interface UploadState {
  state: "uploading" | "saved" | "failed";
  attempts: number;
  blob?: Blob;
  /** The server's own message, shown verbatim — never a generic string. */
  error?: string;
}
