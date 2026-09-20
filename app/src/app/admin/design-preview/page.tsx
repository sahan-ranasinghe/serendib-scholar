import { BeatPreview, DesignPreview } from "./DesignPreview";
import { ScreenPreview } from "./ScreenPreview";

/**
 * /admin/design-preview?frame=<id> — the session shell staged at one of
 * the design's frames (src/lib/designFrames.ts), for scripts/design-check.ts
 * to photograph at 844×390 and diff against the export's own render.
 * /admin/design-preview?screen=<label> — one portrait app screen with the
 * export's sample data (src/lib/appFixtures.ts), the same way.
 * /admin/design-preview?beat=<id>&moment=end|turn|answered — any storyboard
 * beat, staged for board:check's overlap assertion.
 */
export default async function DesignPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (typeof params.screen === "string") return <ScreenPreview label={params.screen} />;
  if (typeof params.beat === "string") return <BeatPreview beatId={params.beat} moment={params.moment === "turn" || params.moment === "answered" ? params.moment : "end"} />;
  const frame = typeof params.frame === "string" ? params.frame : "M1";
  return <DesignPreview frameId={frame} />;
}
