import Link from "next/link";
import type { ReviewArticleDisplay } from "@/lib/admin/reviewArticleDisplay";
import { truncateText } from "@/lib/admin/reviewArticleDisplay";
import EditorialPriorityBadge from "@/components/admin/EditorialPriorityBadge";
import {
  approveArticleFromForm,
  holdArticleFromForm,
} from "@/app/admin/(app)/review/[id]/actions";

type Props = {
  display: ReviewArticleDisplay;
};

export default function ReviewArticleCard({ display }: Props) {
  return (
    <article className="rounded-2xl border p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:gap-5 md:flex-row md:items-start">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name="articleIds"
            value={display.id}
            form="bulk-review-form"
            data-review-article-checkbox="true"
            className="mt-1 h-4 w-4 rounded border-gray-300"
          />

          <div className="h-24 w-24 shrink-0 rounded-xl bg-gray-100 sm:h-28 sm:w-28">
            {display.hasThumbnail && display.thumbnailUrl ? (
              <img
                src={display.thumbnailUrl}
                alt={display.displayTitle}
                className="h-full w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-2 text-center text-xs text-gray-400 sm:text-sm">
                이미지 없음
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 sm:text-xs">
            <span>{display.sourceLabel}</span>
            {display.isRssCollect ? (
              <>
                <span>·</span>
                <span className="rounded bg-violet-50 px-1.5 py-0.5 font-medium text-violet-800">
                  RSS
                </span>
              </>
            ) : null}
            <span>·</span>
            <span>{display.categoryLabel}</span>
            <span>·</span>
            <span>AI 검토: {display.aiReviewLabel}</span>
            <span>·</span>
            <span>상태: {display.reviewStatusLabel}</span>
            <EditorialPriorityBadge value={display.editorialPriority} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold sm:text-xs ${display.translationClassName}`}
            >
              {display.translationLabel}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-700 sm:text-xs">
              {display.bodyStatusLabel}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-700 sm:text-xs">
              {display.imageStatusLabel}
            </span>
            {display.enrichFailure ? (
              <span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-800 sm:text-xs">
                자동 보강 실패 · {display.enrichFailure.categoryLabel}
              </span>
            ) : display.isRssEnriched ? (
              <span className="rounded-full bg-green-50 px-3 py-1 text-[11px] font-semibold text-green-800 sm:text-xs">
                RSS 자동 보강 완료
              </span>
            ) : null}
            {display.shortArticleReviewRecommended ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-900 sm:text-xs">
                짧은 기사 · 최종 검토 권장
              </span>
            ) : null}
          </div>

          {display.shortArticleReviewRecommended && !display.enrichFailure ? (
            <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950 sm:text-sm">
              본문이 권장 목표(900~1,200자)보다 짧습니다. 검토 대기로 저장됐으니
              최종 검토를 권장합니다.
            </p>
          ) : null}
          {display.enrichFailure ? (
            <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs leading-5 text-red-900 sm:text-sm">
              <span className="font-semibold">자동 보강 실패</span>
              {display.enrichFailure.step ? (
                <> · 단계: {display.enrichFailure.step}</>
              ) : null}
              <br />
              {display.enrichFailure.reason}
            </p>
          ) : null}

          <h2 className="mt-3 break-words text-lg font-semibold leading-7 sm:text-xl">
            {display.displayTitle}
          </h2>

          <p className="mt-2 break-words text-sm leading-6 text-gray-600">
            {truncateText(display.displaySummary, 120)}
          </p>

          <p className="mt-2 break-words text-sm leading-6 text-gray-500">
            원문 제목: {display.originalTitle}
          </p>

          <div className="mt-3 space-y-1 text-xs text-gray-500 sm:mt-4 sm:text-sm">
            <p>내부 상태값: {display.statusValue}</p>
            <p>수집 시간: {display.collectedAtLabel}</p>
            <p>원문 발행: {display.publishedAtLabel}</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={`/admin/review/${display.id}`}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              상세 검토
            </Link>

            {display.fromLinkHref ? (
              <Link
                href={display.fromLinkHref}
                className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 transition hover:bg-violet-100"
              >
                from-link 보강
              </Link>
            ) : null}

            <form action={approveArticleFromForm}>
              <input type="hidden" name="articleId" value={display.id} />
              <button
                type="submit"
                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                빠른 승인
              </button>
            </form>

            <form action={holdArticleFromForm}>
              <input type="hidden" name="articleId" value={display.id} />
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
  );
}
