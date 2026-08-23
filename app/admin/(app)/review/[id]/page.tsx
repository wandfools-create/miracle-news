import Link from "next/link";
import ReviewRevisionForm from "@/components/admin/ReviewRevisionForm";
import EditorialPriorityBadge from "@/components/admin/EditorialPriorityBadge";
import EditorialPriorityForm from "@/components/admin/EditorialPriorityForm";
import {
  buildReviewArticleDisplay,
  getReviewKoBody,
  isRssCollectArticle,
  safeTrimmed,
  type ReviewQueueArticleRow,
} from "@/lib/admin/reviewArticleDisplay";
import { normalizeEditorialPriority } from "@/lib/admin/editorialPriority";
import { setEditorialPriorityFromForm } from "@/lib/admin/setEditorialPriority";
import { supabase } from "../../../../../lib/supabase";
import {
  approveArticleDetailFromForm,
  clearMainTopStoryFromForm,
  rejectArticleFromForm,
  setMainTopStoryFromForm,
} from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminReviewDetailPage({ params }: PageProps) {
  const { id } = await params;

  const baseSelect = `
      id,
      source,
      source_section,
      original_url,
      title_original,
      body_original,
      summary_original,
      title_ko,
      summary_ko,
      title_translated,
      body_translated,
      summary_translated,
      category,
      ai_review_status,
      ai_review_notes,
      review_status,
      revision_status,
      thumbnail_url,
      published_at,
      collected_at,
      status
    `;

  let article: ReviewQueueArticleRow | null = null;
  let error: { message?: string } | null = null;
  let isTopStory = false;
  let topStoryOrder = 0;
  let editorialPriority = "normal";

  const withTopStory = await supabase
    .from("articles")
    .select(
      `
      ${baseSelect},
      is_top_story,
      top_story_order,
      editorial_priority
    `
    )
    .eq("id", id)
    .single();

  if (!withTopStory.error && withTopStory.data) {
    const row = withTopStory.data as ReviewQueueArticleRow & {
      is_top_story?: boolean;
      top_story_order?: number;
      editorial_priority?: string | null;
    };
    article = row;
    isTopStory = Boolean(row.is_top_story);
    topStoryOrder = row.top_story_order ?? 0;
    editorialPriority = normalizeEditorialPriority(row.editorial_priority);
  } else {
    const fallback = await supabase
      .from("articles")
      .select(baseSelect)
      .eq("id", id)
      .single();
    article = fallback.data as ReviewQueueArticleRow | null;
    error = fallback.error;
  }

  if (error || !article) {
    console.error("[admin/review/detail] load failed", { id, error });
    return (
      <main className="min-h-screen bg-white text-black">
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <h1 className="text-2xl font-bold sm:text-3xl">
            기사 정보를 불러올 수 없습니다.
          </h1>
          <p className="mt-4 text-sm text-gray-600 sm:text-base">
            해당 기사 상세 정보를 찾지 못했습니다.
            {error?.message ? ` (${error.message})` : null}
          </p>
        </section>
      </main>
    );
  }

  let display;
  try {
    display = buildReviewArticleDisplay(article);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/review/detail] display failed", {
      articleId: article.id,
      error: message,
    });
    return (
      <main className="min-h-screen bg-white text-black">
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <h1 className="text-2xl font-bold text-red-800">기사 표시 오류</h1>
          <p className="mt-4 text-sm text-gray-700">
            기사 ID <strong>{article.id}</strong> — {message}
          </p>
        </section>
      </main>
    );
  }

  const bodyKo = getReviewKoBody(article);
  const bodyTranslated = safeTrimmed(article.body_translated);
  const bodyOriginal = safeTrimmed(article.body_original);
  const isRss = isRssCollectArticle(article.source_section);

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 검토 대기 / 상세
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl">
          기사 상세 검토
        </h1>

        {display.enrichFailure ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">
              RSS 자동 보강 실패 · {display.enrichFailure.categoryLabel}
            </p>
            {display.enrichFailure.step ? (
              <p className="mt-1 text-xs opacity-90">단계: {display.enrichFailure.step}</p>
            ) : null}
            <p className="mt-2 leading-6">{display.enrichFailure.reason}</p>
            <p className="mt-2 leading-6">
              RSS 1차 기사(제목·링크·요약)는 유지됩니다.「from-link 보강」으로 수동
              보강하거나 수정 요청을 사용하세요.
            </p>
          </div>
        ) : display.isRssEnriched ? (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-semibold">RSS 자동 보강 완료</p>
            <p className="mt-1 leading-6">
              from-link 파이프라인으로 본문·한글 번역·요약이 반영되었습니다. 검토 후
              승인하세요.
            </p>
          </div>
        ) : isRss ? (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
            <p className="font-semibold">RSS 1차 수집 기사</p>
            <p className="mt-1 leading-6">
              제목·링크·요약만 있습니다. 아래「from-link 보강」으로 본문을 추출하거나,
              수정 요청으로 AI 본문을 생성할 수 있습니다. 자동 공개되지 않습니다.
            </p>
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border p-4 shadow-sm sm:mt-8 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 sm:text-sm">
            <span>{display.sourceLabel}</span>
            <span>·</span>
            <span>{display.categoryLabel}</span>
            <span>·</span>
            <span>AI 검토: {display.aiReviewLabel}</span>
            <span>·</span>
            <span>검토 상태: {display.reviewStatusLabel}</span>
            <span>·</span>
            <span>
              메인 톱:{" "}
              {isTopStory ? `지정됨 (우선순위 ${topStoryOrder})` : "미지정"}
            </span>
            <EditorialPriorityBadge value={editorialPriority} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${display.translationClassName}`}
            >
              {display.translationLabel}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {display.bodyStatusLabel}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {display.imageStatusLabel}
            </span>
            {display.shortArticleReviewRecommended ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                짧은 기사 · 최종 검토 필요
              </span>
            ) : null}
          </div>

          {display.shortArticleReviewRecommended ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">짧은 기사 · 최종 검토 필요</p>
              <p className="mt-1 leading-6 text-amber-900/90">
                본문이 권장 목표(900~1,200자)보다 짧거나 원문 정보량이 적을 수
                있습니다. 승인 전 본문을 확인해 주세요.
              </p>
            </div>
          ) : null}

          <p className="mt-5 text-sm font-semibold text-gray-500">원문 링크</p>
          {display.originalUrl ? (
            <a
              href={display.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block break-all text-sm leading-6 text-blue-600 underline"
            >
              {display.originalUrl}
            </a>
          ) : (
            <p className="mt-2 text-sm text-gray-500">링크 없음</p>
          )}

          {display.fromLinkHref ? (
            <div className="mt-4">
              <Link
                href={display.fromLinkHref}
                className="inline-flex rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100"
              >
                from-link 보강
              </Link>
            </div>
          ) : null}

          <div className="mt-6">
            {display.hasThumbnail && display.thumbnailUrl ? (
              <img
                src={display.thumbnailUrl}
                alt={display.displayTitle}
                className="max-h-80 w-full rounded-2xl object-cover"
              />
            ) : (
              <div className="flex min-h-[8rem] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">
                이미지 없음
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 md:grid-cols-2">
            <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6 md:col-span-2">
              <h2 className="break-words text-xl font-semibold leading-8 sm:text-2xl">
                {display.displayTitle}
              </h2>

              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700 sm:text-base">
                {display.displaySummary === "요약 없음"
                  ? "요약 없음 — from-link 또는 수정 요청으로 보강하세요."
                  : display.displaySummary}
              </p>

              {bodyTranslated ? (
                <div className="mt-6 border-t border-gray-100 pt-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    번역·요약 본문
                  </p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-gray-800 sm:text-base">
                    {bodyTranslated}
                  </p>
                </div>
              ) : bodyKo ? (
                <div className="mt-6 border-t border-gray-100 pt-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    한국어 본문
                  </p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-gray-800 sm:text-base">
                    {bodyKo}
                  </p>
                </div>
              ) : (
                <p className="mt-6 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  본문 보강 필요 — from-link에서 원문 URL로 추출하거나 AI 수정 요청을
                  사용하세요.
                </p>
              )}
            </div>

            <div className="rounded-2xl border bg-gray-50 p-4 sm:p-5">
              <h3 className="text-base font-semibold sm:text-lg">원문 정보</h3>

              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Original Title
                  </p>
                  <p className="mt-2 break-words text-sm leading-6 text-gray-800 sm:text-base">
                    {display.originalTitle}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Original Summary
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800 sm:text-base">
                    {safeTrimmed(article.summary_original) ||
                      safeTrimmed(article.summary_translated) ||
                      "요약 없음"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Source Section
                  </p>
                  <p className="mt-2 break-words text-sm leading-6 text-gray-800 sm:text-base">
                    {safeTrimmed(article.source_section) || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Published At
                  </p>
                  <p className="mt-2 break-words text-sm leading-6 text-gray-800 sm:text-base">
                    {display.publishedAtLabel}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Collected At
                  </p>
                  <p className="mt-2 break-words text-sm leading-6 text-gray-800 sm:text-base">
                    {display.collectedAtLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border p-4 sm:p-5">
              <h3 className="text-base font-semibold sm:text-lg">원문 본문</h3>
              <p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-gray-700 sm:mt-4">
                {bodyOriginal || "본문 보강 필요"}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:mt-8 sm:p-5">
            <h4 className="text-base font-semibold text-amber-900">AI 검토 메모</h4>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                  AI Review Status
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  {display.aiReviewLabel}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                  AI Review Notes
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-amber-900">
                  {safeTrimmed(article.ai_review_notes) || "-"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border bg-green-50 p-4 sm:mt-8 sm:p-5">
            <h4 className="text-base font-semibold text-green-800">기사 승인</h4>

            <form className="mt-4" action={approveArticleDetailFromForm}>
              <input type="hidden" name="articleId" value={article.id} />
              <button
                type="submit"
                className="w-full rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700 sm:w-auto"
              >
                승인 완료로 이동
              </button>
            </form>
          </div>

          <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:mt-8 sm:p-5">
            <h4 className="text-base font-semibold text-orange-950">
              기사 중요도
            </h4>
            <p className="mt-2 text-sm text-orange-950/90">
              특보·특집·이슈는 원문 발행 시각 기준 24시간 동안 홈 자동 정렬에서
              우선합니다. 메인 톱 지정과는 별개입니다.
            </p>
            <div className="mt-4">
              <EditorialPriorityForm
                articleId={article.id}
                current={editorialPriority}
                action={setEditorialPriorityFromForm}
              />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:mt-8 sm:p-5">
            <h4 className="text-base font-semibold text-indigo-900">
              메인 톱 기사 지정
            </h4>
            <p className="mt-2 text-sm text-indigo-900/90">
              수동 지정된 기사는 /ko, /en 메인 최상단 대표 기사 선정에서 자동 로직보다
              우선합니다.
            </p>
            <p className="mt-2 text-sm text-indigo-800">
              현재 상태:{" "}
              {isTopStory ? `지정됨 (우선순위 ${topStoryOrder})` : "미지정"}
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <form
                className="flex flex-wrap items-end gap-3"
                action={setMainTopStoryFromForm}
              >
                <input type="hidden" name="articleId" value={article.id} />
                <label className="text-sm text-indigo-900">
                  우선순위
                  <input
                    name="topStoryOrder"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={topStoryOrder}
                    className="mt-1 w-24 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
                >
                  메인 톱 기사 지정
                </button>
              </form>

              {isTopStory ? (
                <form action={clearMainTopStoryFromForm}>
                  <input type="hidden" name="articleId" value={article.id} />
                  <button
                    type="submit"
                    className="rounded-xl border border-indigo-300 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                  >
                    메인 톱 지정 해제
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          <ReviewRevisionForm articleId={article.id} />

          <div className="mt-6 rounded-2xl border bg-red-50 p-4 sm:mt-8 sm:p-5">
            <h4 className="text-base font-semibold text-red-800">기사 반려</h4>

            <form className="mt-4 space-y-4" action={rejectArticleFromForm}>
              <input type="hidden" name="articleId" value={article.id} />
              <div>
                <label className="mb-2 block text-sm font-medium text-red-800">
                  반려 사유
                </label>
                <textarea
                  name="rejectedReason"
                  rows={4}
                  className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl border border-red-300 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 sm:w-auto"
              >
                반려 저장
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
