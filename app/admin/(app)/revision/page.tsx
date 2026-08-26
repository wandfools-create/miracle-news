import Link from "next/link";
import RevisionArticleActions from "@/components/admin/RevisionArticleActions";
import AdminListPager from "@/components/admin/AdminListPager";
import DiscardConfirmSubmitButton from "@/components/admin/DiscardConfirmSubmitButton";
import { discardArticlesAction } from "@/app/admin/(app)/discard/actions";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import {
  ADMIN_LIST_PAGE_SIZE,
  adminListRange,
  parseAdminListPage,
} from "@/lib/admin/listPagination";
import { supabase } from "../../../../lib/supabase";
import SelectAllReviewCheckbox from "../review/SelectAllReviewCheckbox";

export const dynamic = "force-dynamic";

const feedbackTypeLabelMap: Record<string, string> = {
  title_mismatch: "제목 불일치",
  image_mismatch: "이미지 불일치",
  content_mismatch: "내용 불일치",
  bad_translation: "번역 이상",
  wrong_link: "링크 문제",
  wrong_category: "카테고리 오류",
  low_quality_article: "기사 품질 낮음",
  duplicate_issue: "중복 이슈 확인 필요",
  other: "기타",
};

function getFeedbackTypeLabel(value: string | null) {
  if (!value) return "기타";
  return feedbackTypeLabelMap[value] ?? value;
}

function formatRequestedAt(value: string | null | undefined) {
  if (!value) return "시각 없음";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시각 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

type PageProps = {
  searchParams: Promise<{
    aiError?: string;
    page?: string;
    discarded?: string;
    skipped?: string;
    discardError?: string;
  }>;
};

export default async function AdminRevisionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { aiError } = params;
  const discarded = params.discarded?.trim();
  const skipped = params.skipped?.trim();
  const discardError = params.discardError?.trim();
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
      revision_request,
      thumbnail_url,
      ai_review_status,
      ai_review_notes,
      article_revision_logs (
        id,
        feedback_type,
        feedback_note,
        requested_at
      )
    `,
      { count: "exact" }
    )
    .eq("review_status", "needs_revision")
    .eq("revision_status", "requested")
    .order("requested_at", {
      referencedTable: "article_revision_logs",
      ascending: false,
    })
    .range(from, to);

  const rows = articles ?? [];
  const totalCount = count ?? 0;

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 수정 대기
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl">
          수정 대기 기사
        </h1>

        <p className="mt-3 text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base">
          수정 요청이 들어간 기사입니다. 기본 {ADMIN_LIST_PAGE_SIZE}건씩 불러옵니다.
          목록에 들어오면 from-link와 동일한 OpenAI 로직으로 본문을 자동 수정합니다.
          더 이상 필요 없는 기사는 폐기할 수 있으며,{" "}
          <Link href="/admin/archive?tab=articles" className="underline">
            보관함
          </Link>
          에서 복구됩니다.
        </p>

        {aiError ? (
          <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:mt-8">
            재검토 전 AI 검토 실패: {aiError}
          </div>
        ) : null}

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
            현재 수정 대기 기사가 없습니다.
          </div>
        ) : null}

        {!error && rows.length > 0 ? (
          <>
            <form id="bulk-revision-form" className="mt-6 sm:mt-8">
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-gray-50 p-4">
                <SelectAllReviewCheckbox
                  targetName="articleIds"
                  label="전체 선택"
                />
                <input type="hidden" name="from" value="revision" />
                <DiscardConfirmSubmitButton
                  mode="bulk"
                  formAction={discardArticlesAction}
                />
              </div>
            </form>

            <div className="grid gap-3 sm:gap-4">
              {rows.map((article) => {
                const latestLog = article.article_revision_logs?.[0] ?? null;

                return (
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
                          form="bulk-revision-form"
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
                          <span>
                            수정 유형:{" "}
                            {getFeedbackTypeLabel(
                              latestLog?.feedback_type ?? null
                            )}
                          </span>
                          <span>·</span>
                          <span>
                            요청 시각:{" "}
                            {formatRequestedAt(latestLog?.requested_at)}
                          </span>
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
                          수정 요청 메모:{" "}
                          {latestLog?.feedback_note ||
                            article.revision_request ||
                            "없음"}
                        </p>

                        <RevisionArticleActions
                          articleId={article.id}
                          revisionLogId={latestLog?.id ?? null}
                          feedbackType={latestLog?.feedback_type ?? null}
                          feedbackNote={
                            latestLog?.feedback_note ||
                            article.revision_request ||
                            ""
                          }
                          aiReviewStatus={article.ai_review_status}
                          aiReviewNotes={article.ai_review_notes}
                        />

                        <form action={discardArticlesAction} className="mt-3">
                          <input
                            type="hidden"
                            name="articleId"
                            value={article.id}
                          />
                          <input type="hidden" name="from" value="revision" />
                          <DiscardConfirmSubmitButton mode="single" />
                        </form>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <AdminListPager
              pathname="/admin/revision"
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
