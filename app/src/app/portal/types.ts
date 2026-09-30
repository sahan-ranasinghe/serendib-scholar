/** Shared shapes between the portal page and its parts. */

export interface PortalTake {
  /** saved = kept, awaiting a reviewer; approved = served to children (VOICE_PROFILE=human); rejected = record it again. */
  status: "uploading" | "saved" | "pending_processing" | "failed" | "approved" | "rejected";
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
  /** Kept for older rows; every line is its own row now (one recording per distinct line). */
  branchLabel: string | null;
  /** Which group of the runtime's lines this is (src/lib/spokenLines.ts): lesson, fixed lines, later sessions, … */
  group?: string;
  /** How many places in the lesson say this very line (one recording covers them all). */
  uses?: number;
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

/** THE voice coverage count (src/lib/voiceCoverage.ts): distinct clips needed against hers recorded and approved, by group. */
export interface PortalCoverage {
  needed: number;
  recorded: number;
  approved: number;
  ai: number;
  groups: Array<{ group: string; needed: number; recorded: number; approved: number; ai: number }>;
}
