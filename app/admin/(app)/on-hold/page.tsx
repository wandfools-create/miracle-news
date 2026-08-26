import Link from "next/link";
import AdminListPager from "@/components/admin/AdminListPager";
import DiscardConfirmSubmitButton from "@/components/admin/DiscardConfirmSubmitButton";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import {
  ADMIN_LIST_PAGE_SIZE,
  adminListRange,
  parseAdminListPage,
} from "@/lib/admin/listPagination";
import { discardArticlesAction } from "@/app/admin/(app)/discard/actions";
import { supabase } from "../../../../lib/supabase";
import SelectAllReviewCheckbox from "../review/SelectAllReviewCheckbox";
import { bulkResumeToReview, resumeToReview } from "./actions";

export const dynamic = "force-dynamic";

const categoryLabelMap: Record<string, string> = {
  politics: "정치",
  economy: "경제",
  society: "사회",
  world: "국제",
  religion: "종교",
  other: "기타",
};

function getCategoryLabel(value: string | null) {
  if (!value) return "미분류";
  return categoryLabelMap[value] ?? value;
}

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) return "요약이 없습니다.";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

function formatAdminDateTime(value: string | null | undefined) {
  if (!value) return "시간 없음";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default async function AdminOnHoldPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    discarded?: string;
    skipped?: string;
    discardError?: string;
  }>;
}) {
  const params = await searchParams;
  const page = parseAdminListPage(params.page);
  const discarded = params.discarded?.trim();
  const skipped = params.skipped?.trim();
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
      category,
      ai_review_status,
      review_status,
      status,
      thumbnail_url,
      published_at,
      collected_at,
      updated_at
    `,
      { count: "exact" }
    )
    .eq("review_status", "on_hold")
    .order("updated_at", { ascending: false })
    .range(from, to);

  const rows = articles ?? [];
  const totalCount = count ?? 0;

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 보류 기사
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl">
          보류 기사
        </h1>

        <p className="mt-3 text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base">
          검토를 보류해 둔 기사 목록입니다. 기본 {ADMIN_LIST_PAGE_SIZE}건씩 불러옵니다.
          다시 검토할 준비가 되면 검토 대기로 보내거나, 불필요한 기사는 폐기할 수
          있습니다. 폐기된 기사는{" "}
          <Link href="/admin/archive?tab=articles" className="underline">
            보관함
          </Link>
          에서 복구할 수 있습니다.
        </p>

        {discarded != null ? (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {discarded}건을 폐기(보관)했습니다.
            {skipped && Number(skipped) > 0
              ? ` (건너뜀 ${skipped}건)`
              : null}
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
            현재 보류 중인 기사가 없습니다.
          </div>
        ) : null}

        {!error && rows.length > 0 ? (
          <>
            <form id="bulk-on-hold-form" className="mt-6 sm:mt-8">
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-gray-50 p-4">
                <SelectAllReviewCheckbox
                  targetName="articleIds"
                  label="전체 선택"
                />

                <button
                  type="submit"
                  formAction={bulkResumeToReview}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  선택 기사 검토 대기로 보내기
                </button>

                <input type="hidden" name="from" value="on_hold" />
                <DiscardConfirmSubmitButton
                  mode="bulk"
                  formAction={discardArticlesAction}
                />
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
                        form="bulk-on-hold-form"
                        data-review-article-checkbox="true"
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />

                      <div className="h-24 w-24 shrink-0 rounded-xl bg-gray-100 sm:h-28 sm:w-28">
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
                        <span>{getCategoryLabel(article.category)}</span>
                        <span>·</span>
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                          보류
                        </span>
                      </div>

                      <h2 className="mt-3 break-words text-lg font-semibold leading-7 sm:text-xl">
                        {article.title_ko ||
                          article.title_translated ||
                          article.title_original}
                      </h2>

                      <p className="mt-2 break-words text-sm leading-6 text-gray-600">
                        {truncateText(
                          article.summary_ko ||
                            article.summary_translated ||
                            article.summary_original,
                          120
                        )}
                      </p>

                      <p className="mt-2 break-words text-sm leading-6 text-gray-500">
                        원문 제목: {article.title_original}
                      </p>

                      <div className="mt-3 space-y-1 text-xs text-gray-500 sm:mt-4 sm:text-sm">
                        <p>내부 상태값: {article.status}</p>
                        <p>보류 갱신: {formatAdminDateTime(article.updated_at)}</p>
                        <p>수집 시간: {formatAdminDateTime(article.collected_at)}</p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Link
                          href={`/admin/review/${article.id}`}
                          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                        >
                          상세 보기
                        </Link>

                        <form
                          action={async () => {
                            "use server";
                            await resumeToReview(article.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            검토 대기로 보내기
                          </button>
                        </form>

                        <form action={discardArticlesAction}>
                          <input type="hidden" name="articleId" value={article.id} />
                          <input type="hidden" name="from" value="on_hold" />
                          <DiscardConfirmSubmitButton mode="single" />
                        </form>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <AdminListPager
              pathname="/admin/on-hold"
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
