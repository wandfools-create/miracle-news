/** Default page size for admin article list screens. */
export const ADMIN_LIST_PAGE_SIZE = 50;

export function parseAdminListPage(raw?: string | null): number {
  const n = Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10_000);
}

/** Inclusive PostgREST `.range(from, to)`. */
export function adminListRange(
  page: number,
  pageSize = ADMIN_LIST_PAGE_SIZE
): { from: number; to: number } {
  const safePage = Math.max(1, page);
  const from = (safePage - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function adminListHasMore(
  page: number,
  fetchedCount: number,
  totalCount: number,
  pageSize = ADMIN_LIST_PAGE_SIZE
): boolean {
  return page * pageSize < totalCount && fetchedCount > 0;
}

export function buildAdminListHref(
  pathname: string,
  params: Record<string, string | undefined | null>,
  page: number
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page") continue;
    const v = value?.trim();
    if (v) sp.set(key, v);
  }
  if (page > 1) sp.set("page", String(page));
  const q = sp.toString();
  return q ? `${pathname}?${q}` : pathname;
}
