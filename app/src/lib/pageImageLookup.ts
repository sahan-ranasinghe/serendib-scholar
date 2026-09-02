import { supabaseAdmin } from "@/lib/supabaseClient";

/**
 * Shared server-side page-image lookups, used by show-page-image,
 * next-page, and previous-page (src/app/api/tools/*) — all three need the
 * same "which stored page image belongs to this file" query, just with a
 * different target page_number.
 */

/**
 * source_reference may be a single-chunk reference ("file.pdf#chunk-12") or
 * a merged-passage range ("file.pdf#chunk-5-7" — see
 * search-syllabus/route.ts's mergeAdjacentChunks); either way, everything
 * from the last "#chunk-" onward is the file's own prefix.
 */
export function filePrefixFromSourceReference(sourceReference: string): string {
  return sourceReference.replace(/#chunk-[\d-]+$/, "");
}

export interface StoredPageImage {
  pageNumber: number;
  imageUrl: string;
  printedPageNumber: number | null;
}

/** The real stored image for one specific page of a file, if any. */
export async function lookupPageImage(filePrefix: string, pageNumber: number): Promise<StoredPageImage | null> {
  const { data, error } = await supabaseAdmin
    .from("syllabus_chunks")
    .select("image_url, printed_page_number")
    .like("source_reference", `${filePrefix}%`)
    .eq("page_number", pageNumber)
    .not("image_url", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.image_url) return null;
  return { pageNumber, imageUrl: data.image_url, printedPageNumber: data.printed_page_number };
}

/**
 * The next (or previous) distinct page of a file that has a real stored
 * image, relative to `currentPageNumber` — not necessarily currentPageNumber
 * ± 1, since not every raw page is guaranteed to have one (english chunks
 * never do). Used by next_page/previous_page for walking through a
 * worksheet or diagram sequence.
 */
export async function lookupAdjacentPageImage(
  filePrefix: string,
  currentPageNumber: number,
  direction: "next" | "previous",
): Promise<StoredPageImage | null> {
  let query = supabaseAdmin
    .from("syllabus_chunks")
    .select("page_number, image_url, printed_page_number")
    .like("source_reference", `${filePrefix}%`)
    .not("image_url", "is", null);

  query =
    direction === "next"
      ? query.gt("page_number", currentPageNumber).order("page_number", { ascending: true })
      : query.lt("page_number", currentPageNumber).order("page_number", { ascending: false });

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) throw error;
  if (!data?.image_url) return null;
  return { pageNumber: data.page_number, imageUrl: data.image_url, printedPageNumber: data.printed_page_number };
}
