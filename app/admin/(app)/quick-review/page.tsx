export const dynamic = "force-dynamic";

import Link from "next/link";
import AdminListPager from "@/components/admin/AdminListPager";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import {
  ADMIN_LIST_PAGE_SIZE,
  adminListRange,
  parseAdminListPage,
} from "@/lib/admin/listPagination";
import { supabase } from "@/lib/supabase";
import {
  ARTICLE_WORKFLOW,
  formatDateTimeKo,
  getCategoryLabel,
} from "@/lib/articleWorkflow";

type PageProps = {
  searchParams: Promise<{ page?: string; error?: string }>;
};

function previewParagraphs(body: string | null, max = 3): string {
  if (!body?.trim()) return "";
  const parts = body
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.slice(0, max).join("\n\n");
}

export default async function AdminQuickReviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseAdminListPage(params.page);
  const { from, to } = adminListRange(page);

  const { data: articles, error, count } = await supabase
    .from("articles")
    .select(
      `
      id,
      source,
      original_url,
      title_original,
      title_translated,
      title_ko,
      summary_original,
      summary_translated,
      summary_ko,
      body_translated,
      body_original,
      category,
      status,
      review_status,
      thumbnail_url,
      collected_at,
      ai_review_status,
      ai_review_notes
    `,
      { count: "exact" }
    )
    .eq("review_status", ARTICLE_WORKFLOW.quickReview.review_status)
    .eq("status", ARTICLE_WORKFLOW.quickReview.status)
    .eq("is_published", false)
    .order("collected_at", { ascending: false })
    .range(from, to);

  const totalCount = count ?? 0;
  const rows = articles ?? [];

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-sm font-semibold tracking-wide text-gray-500">
          관리자 / 빠른 검토
        </p>

        <h1 className="mt-4 text-3xl font-bold tracking-tight">빠른 검토</h1>

        <p className="mt-4 text-gray-600">
          Discord·데스크에서 만든 기사입니다. 한 번 확인한 뒤 바로 공개하거나,
          수정이 필요하면 기존 검토 대기로 보냅니다. 자동 공개는 없습니다.
        </p>

        {params.error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {params.error}
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 text-red-600">불러오기 실패: {error.message}</p>
        ) : null}

        <p className="mt-4 text-sm text-gray-500">
          총 {totalCount}건 · 페이지당 {ADMIN_LIST_PAGE_SIZE}건
        </p>

        <div className="mt-8 space-y-6">
          {rows.length === 0 ? (
            <p className="text-gray-500">빠른 검토 대기 기사가 없습니다.</p>
          ) : (
            rows.map((article) => {
              const titleKo =
                article.title_ko ||
                article.title_translated ||
                article.title_original ||
                "제목 없음";
              const titleEn = article.title_original;
              const summary =
                article.summary_ko ||
                article.summary_translated ||
                article.summary_original ||
                "";
              const bodyPreview = previewParagraphs(
                article.body_translated || article.body_original
              );

              return (
                <article
                  key={article.id}
                  className="rounded-2xl border border-gray-200 p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row">
                    <div className="h-28 w-40 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                      {article.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={article.thumbnail_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-400">
                          이미지 없음
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500">
                        {getArticleSourceLabel(article.source)} ·{" "}
                        {getCategoryLabel(article.category)} ·{" "}
                        {formatDateTimeKo(article.collected_at)}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold tracking-tight">
                        {titleKo}
                      </h2>
                      {titleEn && titleEn !== titleKo ? (
                        <p className="mt-1 text-sm text-gray-600">{titleEn}</p>
                      ) : null}
                      {summary ? (
                        <p className="mt-3 text-sm text-gray-700 line-clamp-3">
                          {summary}
                        </p>
                      ) : null}
                      {bodyPreview ? (
                        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-gray-600 line-clamp-6">
                          {bodyPreview}
                        </pre>
                      ) : (
                        <p className="mt-3 text-sm text-red-600">본문 없음</p>
                      )}
                      {article.original_url ? (
                        <p className="mt-3 truncate text-xs text-blue-700">
                          <a
                            href={article.original_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {article.original_url}
                          </a>
                        </p>
                      ) : null}
                      <div className="mt-4">
                        <Link
                          href={`/admin/quick-review/${article.id}`}
                          className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
                        >
                          빠른 검토 열기
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="mt-8">
          <AdminListPager
            pathname="/admin/quick-review"
            page={page}
            totalCount={totalCount}
            fetchedCount={rows.length}
            pageSize={ADMIN_LIST_PAGE_SIZE}
          />
        </div>
      </section>
    </main>
  );
}
