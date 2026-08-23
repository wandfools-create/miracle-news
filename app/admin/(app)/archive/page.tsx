import Link from "next/link";
import type { ReactNode } from "react";

import AdminListPager from "@/components/admin/AdminListPager";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import {
  ADMIN_LIST_PAGE_SIZE,
  adminListRange,
  parseAdminListPage,
} from "@/lib/admin/listPagination";
import {
  COLLECTION_CANDIDATE_LIST_SELECT,
  CANDIDATE_STATUS_LABELS,
  type CollectionCandidateRow,
} from "@/lib/collection-candidates/types";
import { formatDateTimeKo, getCategoryLabel } from "@/lib/articleWorkflow";
import { supabase } from "@/lib/supabase";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ tab?: string; page?: string }>;
};

export default async function AdminArchivePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = params.tab === "candidates" ? "candidates" : "articles";
  const page = parseAdminListPage(params.page);
  const { from, to } = adminListRange(page);

  if (tab === "articles") {
    const { data, error, count } = await supabase
      .from("articles")
      .select(
        `
        id,
        source,
        original_url,
        title_ko,
        title_original,
        title_translated,
        category,
        status,
        review_status,
        updated_at,
        collected_at,
        created_at
      `,
        { count: "exact" }
      )
      .eq("status", "archived")
      .eq("review_status", "archived")
      .order("updated_at", { ascending: false })
      .range(from, to);

    const rows = data ?? [];
    const totalCount = count ?? 0;

    return (
      <ArchiveShell tab={tab}>
        {error ? (
          <p className="mt-6 text-sm text-red-700">조회 실패: {error.message}</p>
        ) : null}
        {!error && rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border p-5 text-sm text-gray-600">
            보관된 기사가 없습니다.
          </p>
        ) : null}
        {!error && rows.length > 0 ? (
          <div className="mt-6 grid gap-3">
            {rows.map((article) => (
              <article key={article.id} className="rounded-2xl border p-4">
                <p className="text-xs text-gray-500">
                  {getArticleSourceLabel({
                    source: article.source,
                    original_url: article.original_url,
                  })}{" "}
                  · {getCategoryLabel(article.category)} · archived
                </p>
                <h2 className="mt-2 text-lg font-semibold">
                  {article.title_ko ||
                    article.title_translated ||
                    article.title_original ||
                    "제목 없음"}
                </h2>
                <p className="mt-2 text-xs text-gray-500">
                  갱신: {formatDateTimeKo(article.updated_at)}
                </p>
                <Link
                  href={`/admin/review/${article.id}`}
                  className="mt-3 inline-block text-sm text-blue-600 underline"
                >
                  상세
                </Link>
              </article>
            ))}
            <AdminListPager
              pathname="/admin/archive"
              page={page}
              totalCount={totalCount}
              fetchedCount={rows.length}
              filterParams={{ tab: "articles" }}
            />
          </div>
        ) : null}
      </ArchiveShell>
    );
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return (
      <ArchiveShell tab={tab}>
        <p className="mt-6 text-sm text-red-700">{envCheck.error}</p>
      </ArchiveShell>
    );
  }

  const { client } = createServiceRoleSupabaseClient();
  const { data, error, count } = await client
    .from("collection_candidates")
    .select(COLLECTION_CANDIDATE_LIST_SELECT, { count: "exact" })
    .eq("status", "expired")
    .order("updated_at", { ascending: false })
    .range(from, to);

  const rows = (data ?? []) as CollectionCandidateRow[];
  const totalCount = count ?? 0;

  return (
    <ArchiveShell tab={tab}>
      {error ? (
        <p className="mt-6 text-sm text-red-700">조회 실패: {error.message}</p>
      ) : null}
      {!error && rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border p-5 text-sm text-gray-600">
          만료된 수집 후보가 없습니다.
        </p>
      ) : null}
      {!error && rows.length > 0 ? (
        <div className="mt-6 grid gap-3">
          {rows.map((c) => (
            <article key={c.id} className="rounded-2xl border p-4">
              <p className="text-xs text-gray-500">
                {c.source} · {CANDIDATE_STATUS_LABELS.expired}
              </p>
              <h2 className="mt-2 text-base font-semibold">
                {c.rss_title_ko || c.rss_title}
              </h2>
              <p className="mt-2 break-all text-xs text-gray-500">
                {c.original_url}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                생성: {formatDateTimeKo(c.created_at)}
              </p>
            </article>
          ))}
          <AdminListPager
            pathname="/admin/archive"
            page={page}
            totalCount={totalCount}
            fetchedCount={rows.length}
            filterParams={{ tab: "candidates" }}
          />
        </div>
      ) : null}
    </ArchiveShell>
  );
}

function ArchiveShell({
  tab,
  children,
}: {
  tab: "articles" | "candidates";
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold tracking-wide text-gray-500">
          관리자 / 보관함
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
          보관함
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          archived 기사와 expired 후보만 표시합니다. 일반 목록·상단 카운트에는
          포함되지 않습니다. 기본 {ADMIN_LIST_PAGE_SIZE}건씩 조회합니다.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/admin/archive?tab=articles"
            className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
              tab === "articles"
                ? "border-black bg-black text-white"
                : "border-gray-300 bg-white text-gray-800"
            }`}
          >
            보관 기사
          </Link>
          <Link
            href="/admin/archive?tab=candidates"
            className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
              tab === "candidates"
                ? "border-black bg-black text-white"
                : "border-gray-300 bg-white text-gray-800"
            }`}
          >
            만료 후보
          </Link>
          <Link
            href="/admin/cleanup"
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
          >
            정리 실행
          </Link>
        </div>
        {children}
      </section>
    </main>
  );
}
