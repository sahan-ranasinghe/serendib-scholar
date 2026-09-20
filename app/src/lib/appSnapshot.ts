/**
 * THE APP SNAPSHOT — everything the child-facing screens (and the parent
 * zone) render, in one object: computed once on the server from the
 * child's records, held in the client store (src/lib/appStore.tsx), cached
 * on the device, revalidated in the background. No screen waits on a fetch
 * to render its structure (docs/qa/session1-triage.md, cluster H).
 */
import type { ChildSettings } from "@/lib/childStore";
import type { CertificateData, HomeData, LessonDetailData, LessonMapData, ParentZoneData, PracticeData, ProfilesData, ProgressData, ReportData, RewardsData, SummaryData } from "@/lib/appTypes";

export interface AppSnapshot {
  /** Whose records these are: the store drops a snapshot for another child. */
  childId: string;
  childName: string;
  /** Every child on this device (the same parent contact) — the home header's switcher. Not PIN-gated: the splash shows the same list. */
  kids: Array<{ id: string; name: string; grade: number; active: boolean }>;
  home: HomeData;
  lessons: LessonMapData;
  /** By lesson number. */
  lessonDetail: Record<string, LessonDetailData>;
  summary: SummaryData;
  practice: PracticeData;
  rewards: RewardsData;
  certificate: CertificateData;
  progress: ProgressData;
  /** Present only when this device may act as the parent (no PIN yet, or the PIN cookie). */
  parent: { zone: ParentZoneData; report: ReportData; profiles: ProfilesData; settings: { settings: ChildSettings; source: string } } | null;
  /** The parent zone is gated by a PIN (a PIN exists and the cookie is absent). */
  pinRequired: boolean;
  /** A parent PIN exists at all (no PIN → the zone opens with the create-a-PIN screen). */
  pinSet: boolean;
  /** When the server computed it (ISO). */
  at: string;
}

export const APP_SNAPSHOT_VERSION = 3;
