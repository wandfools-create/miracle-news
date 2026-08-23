export const dynamic = "force-dynamic";

import Link from "next/link";
import AdminListPager from "@/components/admin/AdminListPager";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import EditorialPriorityBadge from "@/components/admin/EditorialPriorityBadge";
import EditorialPriorityForm from "@/components/admin/EditorialPriorityForm";
import { normalizeEditorialPriority } from "@/lib/admin/editorialPriority";
import {
  ADMIN_LIST_PAGE_SIZE,
  adminListRange,
  parseAdminListPage,
} from "@/lib/admin/listPagination";
import { setEditorialPriorityFromForm } from "@/lib/admin/setEditorialPriority";
import { supabase } from "../../../../lib/supabase";
import { bulkPublishArticles, publishArticle } from "./actions";
import SelectAllReviewCheckbox from "../review/SelectAllReviewCheckbox";
import {
  ARTICLE_WORKFLOW,
  formatDateTimeKo,
  getCategoryLabel,
} from "../../../../lib/articleWorkflow";

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminApprovedPage({ searchParams }: PageProps) {
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
      category,
      status,
      review_status,
      revision_status,
      thumbnail_url,
      approved_at,
      approved_by,
      is_published,
      editorial_priority
    `,
      { count: "exact" }
    )
    .eq("review_status", ARTICLE_WORKFLOW.approved.review_status)
    .eq("status", ARTICLE_WORKFLOW.approved.status)
    .eq("is_published", ARTICLE_WORKFLOW.approved.is_published)
    .order("approved_at", { ascending: false })
    .range(from, to);

  const totalCount = count ?? 0;
  const rows = articles ?? [];

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-sm font-semibold tracking-wide text-gray-500">
          관리자 / 승인 완료
        </p>

        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          승인 완료 기사
        </h1>

        <p className="mt-4 text-gray-600">
          검토가 끝났고, 아직 공개 전인 기사 목록입니다. 기본{" "}
          {ADMIN_LIST_PAGE_SIZE}건씩 불러옵니다.
        </p>

        {error ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            데이터를 불러오는 중 오류가 발생했습니다: {error.message}
          </div>
        ) : null}

        {!error && rows.length === 0 ? (
          <div className="mt-8 rounded-2xl border p-6 text-gray-600">
            현재 승인 완료 기사가 없습니다.
          </div>
        ) : null}

        {!error && rows.length > 0 ? (
          <>
            <form id="bulk-publish-form" className="mt-8 mb-6">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-gray-50 p-4">
                <SelectAllReviewCheckbox targetName="articleIds" label="전체 선택" />

                <button
                  type="submit"
                  formAction={bulkPublishArticles}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  선택 기사 일괄 공개
                </button>
              </div>
            </form>

            <div className="grid gap-4">
              {rows.map((article) => (
                <article
                  key={article.id}
                  className="rounded-2xl border p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="articleIds"
                        value={article.id}
                        form="bulk-publish-form"
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />

                      <div className="h-28 w-full rounded-xl bg-gray-100 md:w-44">
                        {article.thumbnail_url ? (
                          <img
                            src={article.thumbnail_url}
                            alt={
                              article.title_ko ||
                              article.title_translated ||
                              article.title_original
                            }
                            className="h-full w-full rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-gray-400">
                            이미지 없음
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>
                          {getArticleSourceLabel({
                            source: article.source,
                            original_url: article.original_url,
                          })}
                        </span>
                        <span>·</span>
                        <span>{getCategoryLabel(article.category)}</span>
                        <span>·</span>
                        <span>승인자: {article.approved_by || "미상"}</span>
                        <EditorialPriorityBadge
                          value={article.editorial_priority}
                        />
                      </div>

                      <h2 className="mt-3 break-words text-lg font-semibold leading-7 sm:text-xl">
                        {article.title_ko ||
                          article.title_translated ||
                          article.title_original}
                      </h2>

                      <p className="mt-2 break-words text-sm leading-6 text-gray-600">
                        {article.summary_ko ||
                          article.summary_translated ||
                          article.summary_original ||
                          "요약이 없습니다."}
                      </p>

                      <p className="mt-2 text-sm text-gray-500">
                        원문 제목: {article.title_original}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span>승인 시각: {formatDateTimeKo(article.approved_at)}</span>
                        <span>·</span>
                        <span>status: {article.status || "없음"}</span>
                        <span>·</span>
                        <span>review: {article.review_status || "없음"}</span>
                        <span>·</span>
                        <span>published: {String(article.is_published)}</span>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-4">
                        <Link
                          href={`/admin/review/${article.id}`}
                          className="text-sm font-medium text-blue-600 underline"
                        >
                          기사 상세 다시 보기
                        </Link>

                        <EditorialPriorityForm
                          articleId={article.id}
                          current={normalizeEditorialPriority(
                            article.editorial_priority
                          )}
                          action={setEditorialPriorityFromForm}
                          compact
                        />

                        <form
                          action={async () => {
                            "use server";
                            await publishArticle(article.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            공개
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <AdminListPager
              pathname="/admin/approved"
              page={page}
              totalCount={totalCount}
              fetchedCount={rows.length}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
