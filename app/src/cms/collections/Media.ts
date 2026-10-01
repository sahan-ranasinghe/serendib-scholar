import type { CollectionConfig } from "payload";
import { content } from "../access";

/**
 * The media library — files in the private Supabase Storage bucket "cms-media" (payload.config.mts, storage-s3).
 * Nothing in the app reads it yet: Phase 1 only proves the pipe. The bucket is private, so a file is served through
 * Payload (/api/payload/media/file/<name>) under these rules, never from a public URL.
 *
 * No image sizes, crop or focal point: those need `sharp`, which this phase does not install.
 */
export const Media: CollectionConfig = {
  slug: "media",
  access: {
    read: content("read"),
    create: content("create"),
    update: content("update"),
    delete: content("delete"),
  },
  upload: { crop: false, focalPoint: false },
  fields: [{ name: "alt", type: "text" }],
};
