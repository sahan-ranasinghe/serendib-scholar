import { DesignPreview } from "./DesignPreview";

/**
 * /admin/design-preview?frame=<id> — the session shell staged at one of
 * the design's frames (src/lib/designFrames.ts), for scripts/design-check.ts
 * to photograph at 844×390 and diff against the export's reference PNG.
 * `?list=1` prints the frame ids.
 */
export default async function DesignPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const frame = typeof params.frame === "string" ? params.frame : "M1";
  return <DesignPreview frameId={frame} />;
}
