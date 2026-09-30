import { COPY, t, type CopyKey } from "@/lib/appCopy";

/**
 * THE AVATARS, BY STABLE ID (29 Sep 2026, docs/cms/content-inventory.md §16). A child's avatar is stored as one of
 * these ids (children.avatar); its name is copy (`avatar.<id>`), so renaming one in the copy sheet changes what every
 * child sees and breaks nothing. It used to be stored as the display text itself — renaming "ලේනා" would have
 * orphaned every child who chose it. Old rows are read through `avatarIdOf` until `npm run migrate:avatars -- --apply`
 * has rewritten them.
 */
export const AVATAR_IDS = ["elephant", "peacock", "squirrel", "turtle", "parrot", "leopard", "deer", "fish"] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

const copyKey = (id: AvatarId) => `avatar.${id}` as CopyKey;

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && (AVATAR_IDS as readonly string[]).includes(value);
}

/** An avatar's name, in the language the screen is showing. */
export function avatarName(id: AvatarId): string {
  return t(copyKey(id));
}

/** A stored value → its id: an id as it is, or a legacy display name (Sinhala, or the English gloss) mapped back. */
export function avatarIdOf(stored: unknown): AvatarId | null {
  if (isAvatarId(stored)) return stored;
  if (typeof stored !== "string" || !stored.trim()) return null;
  const value = stored.trim();
  return AVATAR_IDS.find((id) => COPY[copyKey(id)].si === value || COPY[copyKey(id)].en === value) ?? null;
}
