import Link from "next/link";

import {
  ADMIN_LIST_PAGE_SIZE,
  adminListHasMore,
  buildAdminListHref,
} from "@/lib/admin/listPagination";

type Props = {
  pathname: string;
  page: number;
  totalCount: number;
  fetchedCount: number;
  pageSize?: number;
  /** Preserve filter query keys (q, date, range, …). */
  filterParams?: Record<string, string | undefined | null>;
};

export default function AdminListPager({
  pathname,
  page,
  totalCount,
  fetchedCount,
  pageSize = ADMIN_LIST_PAGE_SIZE,
  filterParams = {},
}: Props) {
  const hasMore = adminListHasMore(page, fetchedCount, totalCount, pageSize);
  const hasPrev = page > 1;
  if (totalCount === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-gray-50 px-4 py-3 text-sm text-gray-700">
      <p>
        {from}–{to} / 전체 {totalCount}건
        {pageSize !== ADMIN_LIST_PAGE_SIZE
          ? ` · 페이지당 ${pageSize}`
          : ` · 기본 ${pageSize}건`}
      </p>
      <div className="flex flex-wrap gap-2">
        {hasPrev ? (
          <Link
            href={buildAdminListHref(pathname, filterParams, page - 1)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100"
          >
            이전
          </Link>
        ) : null}
        {hasMore ? (
          <Link
            href={buildAdminListHref(pathname, filterParams, page + 1)}
            className="rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            더 보기
          </Link>
        ) : null}
      </div>
    </div>
  );
}
