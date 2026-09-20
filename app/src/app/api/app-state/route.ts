import { NextResponse, type NextRequest } from "next/server";
import { hasActiveChild } from "@/lib/activeChild";
import { certificateData, homeData, lessonDetailData, lessonMapData, loadChildState, parentZoneData, practiceData, profilesData, progressData, reportData, rewardsData, summaryData } from "@/lib/appData";
import { hasParentAccess } from "@/lib/parentAuth";
import type { AppSnapshot } from "@/lib/appSnapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/app-state — the whole app's screen data for the active child in
 * one round trip (see src/lib/appSnapshot.ts). The parent zone's data rides
 * along only when this device may act as the parent.
 */
export async function GET(request: NextRequest) {
  if (!(await hasActiveChild())) return NextResponse.json({ ok: false, no_child: true }, { status: 409 });
  try {
    const state = await loadChildState();
    const parentAllowed = !state.extras.parentPinHash || (await hasParentAccess(request.headers.get("cookie"), state.id));
    const [home, practice, profiles] = await Promise.all([homeData(state), practiceData(state), profilesData(state)]);
    const lessonDetail: Record<string, ReturnType<typeof lessonDetailData>> = {};
    for (const lesson of state.lessons) lessonDetail[String(lesson.number)] = lessonDetailData(state, lesson.number);
    const snapshot: AppSnapshot = {
      childId: state.id,
      childName: state.name,
      kids: profiles.children.map(({ id, name, grade, active }) => ({ id, name, grade, active })),
      home,
      lessons: lessonMapData(state),
      lessonDetail: Object.fromEntries(Object.entries(lessonDetail).filter(([, v]) => v !== null)) as AppSnapshot["lessonDetail"],
      summary: summaryData(state),
      practice,
      rewards: rewardsData(state),
      certificate: certificateData(state),
      progress: progressData(state),
      parent: parentAllowed ? { zone: parentZoneData(state, profiles.childrenCount), report: reportData(state), profiles, settings: { settings: state.extras.settings, source: state.extras.source } } : null,
      pinRequired: Boolean(state.extras.parentPinHash) && !parentAllowed,
      pinSet: Boolean(state.extras.parentPinHash),
      at: new Date().toISOString(),
    };
    return NextResponse.json({ ok: true, snapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[app-state]", error);
    return NextResponse.json({ ok: false, error: "state_failed" }, { status: 500 });
  }
}
