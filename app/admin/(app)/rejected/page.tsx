import Link from "next/link";
import AdminListPager from "@/components/admin/AdminListPager";
import DiscardArticlesButton from "@/components/admin/DiscardArticlesButton";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import {
  ADMIN_LIST_PAGE_SIZE,
  adminListRange,
  parseAdminListPage,
} from "@/lib/admin/listPagination";
import { supabase } from "../../../../lib/supabase";
import SelectAllReviewCheckbox from "../review/SelectAllReviewCheckbox";

export const dynamic = "force-dynamic";

function formatDateTimeKo(value: string | null | undefined) {
  if (!value) return "기록 없음";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기록 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function AdminRejectedPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    discarded?: string;
    skipped?: string;
    failed?: string;
    discardError?: string;
  }>;
}) {
  const params = await searchParams;
  const page = parseAdminListPage(params.page);
  const discarded = params.discarded?.trim();
  const skipped = params.skipped?.trim();
  const failed = params.failed?.trim();
  const discardError = params.discardError?.trim();
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
      thumbnail_url,
      rejected_reason,
      status,
      review_status,
      updated_at
    `,
      { count: "exact" }
    )
    .eq("status", "rejected")
    .eq("review_status", "rejected")
    .order("updated_at", { ascending: false })
    .range(from, to);

  const rows = articles ?? [];
  const totalCount = count ?? 0;

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 반려 기사
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl">
          반려 기사
        </h1>

        <p className="mt-3 text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base">
          검토 후 반려된 기사 목록입니다. 기본 {ADMIN_LIST_PAGE_SIZE}건씩
          불러옵니다. 더 이상 필요 없는 기사는 폐기할 수 있으며,{" "}
          <Link href="/admin/archive?tab=articles" className="underline">
            보관함
          </Link>
          에서 복구됩니다.
        </p>

        {discarded != null ? (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {Number(discarded) > 0
              ? `${discarded}건을 폐기(보관)했습니다.`
              : "폐기된 기사 0건 — DB가 변경되지 않았습니다."}
            {skipped && Number(skipped) > 0 ? ` · 건너뜀 ${skipped}건` : null}
            {failed && Number(failed) > 0 ? ` · 실패 ${failed}건` : null}
          </div>
        ) : null}
        {discardError ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {discardError}
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mt-8">
            데이터를 불러오는 중 오류가 발생했습니다: {error.message}
          </div>
        ) : null}

        {!error && rows.length === 0 ? (
          <div className="mt-6 rounded-2xl border p-5 text-sm text-gray-600 sm:mt-8 sm:p-6 sm:text-base">
            현재 반려된 기사가 없습니다.
          </div>
        ) : null}

        {!error && rows.length > 0 ? (
          <>
            <form id="bulk-rejected-form" className="mt-6 sm:mt-8">
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-gray-50 p-4">
                <SelectAllReviewCheckbox
                  targetName="articleIds"
                  label="전체 선택"
                />
                <DiscardArticlesButton mode="bulk" from="rejected" />
              </div>
            </form>

            <div className="grid gap-3 sm:gap-4">
              {rows.map((article) => (
                <article
                  key={article.id}
                  className="rounded-2xl border p-4 shadow-sm sm:p-6"
                >
                  <div className="flex flex-col gap-4 sm:gap-5 md:flex-row md:items-start">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="articleIds"
                        value={article.id}
                        form="bulk-rejected-form"
                        data-review-article-checkbox="true"
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <div className="h-24 w-24 shrink-0 rounded-xl bg-gray-100 sm:h-28 sm:w-28 md:w-44">
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

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 sm:text-xs">
                        <span>
                          {getArticleSourceLabel({
                            source: article.source,
                            original_url: article.original_url,
                          })}
                        </span>
                        <span>·</span>
                        <span>반려됨</span>
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

                      <p className="mt-2 break-words text-sm leading-6 text-gray-500">
                        원문 제목: {article.title_original}
                      </p>

                      <p className="mt-3 break-words text-sm leading-6 text-gray-600">
                        반려 사유: {article.rejected_reason || "사유 없음"}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 sm:mt-4 sm:text-sm">
                        <span>status: {article.status || "없음"}</span>
                        <span>·</span>
                        <span>review: {article.review_status || "없음"}</span>
                        <span>·</span>
                        <span>
                          수정 시각: {formatDateTimeKo(article.updated_at)}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-5">
                        <Link
                          href={`/admin/review/${article.id}`}
                          className="text-sm font-medium text-blue-600 underline"
                        >
                          기사 상세 다시 보기
                        </Link>
                        <DiscardArticlesButton
                          mode="single"
                          from="rejected"
                          articleId={article.id}
                        />
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <AdminListPager
              pathname="/admin/rejected"
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
