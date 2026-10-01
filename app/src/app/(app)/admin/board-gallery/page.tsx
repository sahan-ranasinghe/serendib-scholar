import { Gallery } from "./Gallery";

/**
 * /admin/board-gallery — every primitive, every state, every event
 * triggerable by button. The QA surface: nothing ships until it looks
 * right here. `?viewport=phone|desktop` picks the starting frame (the
 * board-check harness uses it).
 */
export default async function BoardGalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const viewport = params.viewport === "desktop" ? "desktop" : "phone";
  return <Gallery initialViewport={viewport} />;
}
