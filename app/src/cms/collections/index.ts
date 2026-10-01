import type { CollectionConfig } from "payload";
import { Media } from "./Media";
import { Users } from "./Users";

/** Every collection the CMS has. Phase 1: the people and the media library — no content yet. */
export const COLLECTIONS: CollectionConfig[] = [Users, Media];
export { Media, Users };
