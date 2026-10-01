import { DesignGallery } from "./DesignGallery";

/**
 * /admin/design-gallery — every board primitive in every state, laid out
 * section for section as the design's components.html, so
 * scripts/design-check.ts can photograph each section and diff it against
 * the export's reference PNG of the same title.
 */
export default function DesignGalleryPage() {
  return <DesignGallery />;
}
