import { ADMIN_LIST_PAGE_SIZE, adminListRange } from "@/lib/admin/listPagination";

/** Page size for collection-candidate range scans (run filter / run index). */
export const COLLECTION_CANDIDATE_FETCH_PAGE_SIZE = ADMIN_LIST_PAGE_SIZE;

/**
 * Walk PostgREST `.range()` pages until a short page.
 * Callers must order by created_at → id (tie-break) for stable results.
 */
export async function collectRowsByRangePagination<T>(
  fetchPage: (
    from: number,
    to: number
  ) => Promise<{ ok: true; rows: T[] } | { ok: false; error: string }>,
  pageSize: number = COLLECTION_CANDIDATE_FETCH_PAGE_SIZE
): Promise<{ ok: true; rows: T[] } | { ok: false; error: string }> {
  const all: T[] = [];
  let page = 1;

  for (;;) {
    const { from, to } = adminListRange(page, pageSize);
    const result = await fetchPage(from, to);
    if (!result.ok) return result;
    all.push(...result.rows);
    if (result.rows.length < pageSize) break;
    page += 1;
    // Safety ceiling: 200 pages × 50 = 10_000 rows
    if (page > 200) break;
  }

  return { ok: true, rows: all };
}
