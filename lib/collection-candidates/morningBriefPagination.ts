import type { CollectionCandidateRow } from "@/lib/collection-candidates/types";

/** Supabase page size for morning-brief candidate scans (no total cap). */
export const MORNING_BRIEF_FETCH_PAGE_SIZE = 100;

/**
 * Paginate until a short page. Callers must order by
 * rss_published_at → created_at → id for stable ties.
 */
export async function collectMorningBriefRowsByPagination(
  fetchPage: (
    from: number,
    to: number
  ) => Promise<
    | { ok: true; rows: CollectionCandidateRow[] }
    | { ok: false; error: string }
  >,
  pageSize: number = MORNING_BRIEF_FETCH_PAGE_SIZE
): Promise<
  | { ok: true; rows: CollectionCandidateRow[] }
  | { ok: false; error: string }
> {
  const all: CollectionCandidateRow[] = [];
  let from = 0;

  for (;;) {
    const to = from + pageSize - 1;
    const page = await fetchPage(from, to);
    if (!page.ok) return page;
    all.push(...page.rows);
    if (page.rows.length < pageSize) break;
    from += pageSize;
  }

  return { ok: true, rows: all };
}
