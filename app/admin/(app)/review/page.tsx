import Link from "next/link";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import { supabase } from "../../../../lib/supabase";
import {
  approveArticle,
  bulkApproveArticles,
  bulkHoldArticles,
  holdArticle,
} from "./[id]/actions";
import SelectAllReviewCheckbox from "./SelectAllReviewCheckbox";

export const revalidate = 0;
export const dynamic = "force-dynamic";

const categoryLabelMap: Record<string, string> = {
  politics: "정치",
  economy: "경제",
  society: "사회",
  world: "국제",
  religion: "종교",
  other: "기타",
};

const aiReviewLabelMap: Record<string, string> = {
  pending: "대기",
  pass: "통과",
  warning: "주의",
  fail: "실패",
};

const reviewStatusLabelMap: Record<string, string> = {
  pending: "검토 전",
  approved: "승인 완료",
  needs_revision: "수정 필요",
  on_hold: "보류",
  rejected: "반려",
};

function getCategoryLabel(value: string | null) {
  if (!value) return "미분류";
  return categoryLabelMap[value] ?? value;
}

function getAiReviewLabel(value: string | null) {
  if (!value) return "미정";
  return aiReviewLabelMap[value] ?? value;
}

function getReviewStatusLabel(value: string | null) {
  if (!value) return "미정";
  return reviewStatusLabelMap[value] ?? value;
}

function getTranslationStatus(titleKo: string | null) {
  return titleKo && titleKo.trim() ? "번역 완료" : "번역 미완료";
}

function getTranslationStatusStyle(titleKo: string | null) {
  return titleKo && titleKo.trim()
    ? "bg-blue-50 text-blue-700"
    : "bg-gray-100 text-gray-600";
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

export default async function AdminReviewPage() {
  const { data: articles, error } = await supabase
    .from("articles")
    .select(`
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
      collected_at
    `)
    .eq("status", "ready_for_human_review")
    .eq("review_status", "pending")
    .order("collected_at", { ascending: false });

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 검토 대기
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl">
          검토 대기 기사
        </h1>

        <p className="mt-3 text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base">
          사람 검토가 필요한 기사 목록입니다.
        </p>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mt-8">
            데이터를 불러오는 중 오류가 발생했습니다: {error.message}
          </div>
        ) : null}

        {!error && (!articles || articles.length === 0) ? (
          <div className="mt-6 rounded-2xl border p-5 text-sm text-gray-600 sm:mt-8 sm:p-6 sm:text-base">
            현재 검토 대기 기사가 없습니다.
          </div>
        ) : null}

        {!error && articles && articles.length > 0 ? (
          <>
            <form id="bulk-review-form" className="mt-6 sm:mt-8">
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-gray-50 p-4">
                <SelectAllReviewCheckbox targetName="articleIds" label="전체 선택" />

                <button
                  type="submit"
                  formAction={bulkApproveArticles}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  선택 기사 일괄 승인
                </button>

                <button
                  type="submit"
                  formAction={bulkHoldArticles}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                >
                  선택 기사 일괄 보류
                </button>
              </div>
            </form>

            <div className="grid gap-3 sm:gap-4">
              {articles.map((article) => (
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
                        form="bulk-review-form"
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
                        <span>AI 검토: {getAiReviewLabel(article.ai_review_status)}</span>
                        <span>·</span>
                        <span>상태: {getReviewStatusLabel(article.review_status)}</span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold sm:text-xs ${getTranslationStatusStyle(
                            article.title_ko
                          )}`}
                        >
                          {getTranslationStatus(article.title_ko)}
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
                        <p>수집 시간: {formatAdminDateTime(article.collected_at)}</p>
                        <p>원문 발행: {formatAdminDateTime(article.published_at)}</p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Link
                          href={`/admin/review/${article.id}`}
                          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                        >
                          상세 검토
                        </Link>

                        <form
                          action={async () => {
                            "use server";
                            await approveArticle(article.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            빠른 승인
                          </button>
                        </form>

                        <form
                          action={async () => {
                            "use server";
                            await holdArticle(article.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                          >
                            보류
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

          
          </>
        ) : null}
      </section>
    </main>
  );
}