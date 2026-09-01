"use client";

import Image from "next/image";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useState } from "react";
import {
  mobileHoldFromForm,
  mobileRejectFromForm,
  mobileRequestRevisionFromForm,
  reviewCompleteAndPublishFromForm,
} from "@/app/admin/(app)/review/publishActions";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import { formatDateTimeKo, getCategoryLabel } from "@/lib/articleWorkflow";
import type { MobileReviewNeighbors } from "@/lib/admin/fetchMobileReviewNeighbors";

export type MobileReviewArticle = {
  id: string;
  source: string | null;
  original_url: string | null;
  title_ko: string | null;
  title_translated: string | null;
  title_original: string | null;
  summary_ko: string | null;
  summary_translated: string | null;
  summary_original: string | null;
  body_translated: string | null;
  body_original: string | null;
  category: string | null;
  thumbnail_url: string | null;
  collected_at: string | null;
  ai_review_status: string | null;
  ai_review_notes: string | null;
};

type MobileReviewDetailProps = {
  article: MobileReviewArticle;
  neighbors: MobileReviewNeighbors;
  displayTitle: string;
  displaySummary: string;
  displayBody: string;
  contentOk: boolean;
  contentErrors: string[];
  sameEventBlocked: boolean;
  sameEventMatch?: {
    id: string;
    title: string;
    source: string;
    publishedAt: string | null;
  } | null;
  errorMessage?: string | null;
  publishedBanner?: string | null;
};

const actionBtn =
  "flex min-h-[48px] w-full items-center justify-center rounded-xl px-4 py-3 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-news-navy disabled:cursor-not-allowed disabled:opacity-40";

function PendingSubmitButton({
  children,
  className,
  disabled,
}: {
  children: React.ReactNode;
  className: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={className}
    >
      {pending ? "처리 중…" : children}
    </button>
  );
}

export default function MobileReviewDetail({
  article,
  neighbors,
  displayTitle,
  displaySummary,
  displayBody,
  contentOk,
  contentErrors,
  sameEventBlocked,
  sameEventMatch,
  errorMessage,
  publishedBanner,
}: MobileReviewDetailProps) {
  const [showReject, setShowReject] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [revisionNote, setRevisionNote] = useState("");
  const [overrideSameEvent, setOverrideSameEvent] = useState(false);

  const sourceLabel = getArticleSourceLabel({
    source: article.source ?? "",
    original_url: article.original_url,
  });
  const listReturn = `/admin/review?from=mobile`;

  return (
    <main className="min-h-screen bg-neutral-50 pb-36 text-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <Link
            href={listReturn}
            className="text-sm font-medium text-neutral-600 underline-offset-2 hover:underline"
          >
            ← 목록
          </Link>
          <p className="text-xs font-semibold text-neutral-500">
            {neighbors.total > 0 && neighbors.index > 0
              ? `${neighbors.index} / ${neighbors.total}`
              : "검토 대기"}
          </p>
          <div className="flex gap-2">
            {neighbors.prevId ? (
              <Link
                href={`/admin/review/mobile/${neighbors.prevId}`}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium"
                aria-label="이전 기사"
              >
                이전
              </Link>
            ) : (
              <span className="px-3 py-1.5 text-sm text-neutral-300">이전</span>
            )}
            {neighbors.nextId ? (
              <Link
                href={`/admin/review/mobile/${neighbors.nextId}`}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium"
                aria-label="다음 기사"
              >
                다음
              </Link>
            ) : (
              <span className="px-3 py-1.5 text-sm text-neutral-300">다음</span>
            )}
          </div>
        </div>
      </header>

      <article className="mx-auto max-w-lg px-4 py-5">
        {publishedBanner ? (
          <p
            className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
            role="status"
          >
            공개 완료. 다음 검토 기사로 이동했습니다.
          </p>
        ) : null}
        {errorMessage ? (
          <p
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {sourceLabel} · {getCategoryLabel(article.category)}
        </p>
        <h1 className="mt-2 text-xl font-bold leading-snug">{displayTitle}</h1>
        <p className="mt-1 text-xs text-neutral-500">
          수집 {formatDateTimeKo(article.collected_at)}
        </p>

        {article.thumbnail_url ? (
          <div className="relative mt-4 aspect-[16/9] overflow-hidden rounded-xl bg-neutral-200">
            <Image
              src={article.thumbnail_url}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 512px) 100vw, 512px"
              unoptimized
            />
          </div>
        ) : null}

        <section className="mt-5">
          <h2 className="text-sm font-bold text-neutral-800">요약</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
            {displaySummary || "(요약 없음)"}
          </p>
        </section>

        <section className="mt-5">
          <h2 className="text-sm font-bold text-neutral-800">본문</h2>
          <div className="mt-2 max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
            {displayBody || "(본문 없음)"}
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
          <p className="font-semibold text-neutral-800">Localization</p>
          <ul className="mt-2 space-y-1 text-neutral-600">
            <li>
              KO:{" "}
              {article.title_ko?.trim() || article.title_translated?.trim()
                ? "제목 있음"
                : "제목 없음"}
              {" · "}
              {article.body_translated?.trim() ? "본문 있음" : "본문 없음"}
            </li>
            <li>
              EN: {article.title_original?.trim() ? "제목 있음" : "제목 없음"}
              {" · "}
              {article.body_original?.trim() ? "본문 있음" : "본문 없음"}
            </li>
          </ul>
        </section>

        {article.original_url ? (
          <p className="mt-4">
            <a
              href={article.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-news-navy underline underline-offset-2"
            >
              원문 확인
            </a>
          </p>
        ) : null}

        <Link
          href={`/admin/review/${article.id}`}
          className="mt-4 inline-flex text-sm font-medium text-neutral-600 underline"
        >
          전체 편집 화면
        </Link>

        {!contentOk ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">공개 전 확인 필요</p>
            <ul className="mt-1 list-disc pl-5">
              {contentErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {sameEventBlocked && sameEventMatch ? (
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
            <p className="font-semibold">유사 공개 기사</p>
            <p className="mt-1">
              {sameEventMatch.source}: {sameEventMatch.title}
            </p>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                checked={overrideSameEvent}
                onChange={(e) => setOverrideSameEvent(e.target.checked)}
                className="mt-1"
              />
              <span>그래도 검토 완료 및 공개 (관리자 override)</span>
            </label>
          </div>
        ) : null}
      </article>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-2 px-4 py-3">
          {showReject ? (
            <form action={mobileRejectFromForm} className="space-y-2">
              <input type="hidden" name="articleId" value={article.id} />
              <input
                type="hidden"
                name="nextArticleId"
                value={neighbors.nextId ?? ""}
              />
              <textarea
                name="rejectedReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="반려 사유"
                rows={2}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                required
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowReject(false)}
                  className={`${actionBtn} border border-neutral-300 bg-white`}
                >
                  취소
                </button>
                <PendingSubmitButton className={`${actionBtn} bg-red-700 text-white`}>
                  반려 확정
                </PendingSubmitButton>
              </div>
            </form>
          ) : showRevision ? (
            <form action={mobileRequestRevisionFromForm} className="space-y-2">
              <input type="hidden" name="articleId" value={article.id} />
              <input
                type="hidden"
                name="nextArticleId"
                value={neighbors.nextId ?? ""}
              />
              <textarea
                name="feedbackNote"
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                placeholder="수정 요청 내용"
                rows={2}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                required
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRevision(false)}
                  className={`${actionBtn} border border-neutral-300 bg-white`}
                >
                  취소
                </button>
                <PendingSubmitButton
                  className={`${actionBtn} bg-amber-600 text-white`}
                >
                  수정 대기로 이동
                </PendingSubmitButton>
              </div>
            </form>
          ) : (
            <>
              <form action={reviewCompleteAndPublishFromForm}>
                <input type="hidden" name="articleId" value={article.id} />
                <input
                  type="hidden"
                  name="nextArticleId"
                  value={neighbors.nextId ?? ""}
                />
                {overrideSameEvent ? (
                  <input type="hidden" name="allowSameEventOverride" value="1" />
                ) : null}
                <PendingSubmitButton
                  disabled={
                    !contentOk || (sameEventBlocked && !overrideSameEvent)
                  }
                  className={`${actionBtn} bg-black text-white`}
                >
                  검토 완료 및 공개
                </PendingSubmitButton>
              </form>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowRevision(true)}
                  className={`${actionBtn} border border-neutral-300 bg-white`}
                >
                  수정 대기
                </button>
                <form action={mobileHoldFromForm}>
                  <input type="hidden" name="articleId" value={article.id} />
                  <input
                    type="hidden"
                    name="nextArticleId"
                    value={neighbors.nextId ?? ""}
                  />
                  <PendingSubmitButton
                    className={`${actionBtn} border border-neutral-300 bg-white`}
                  >
                    보류
                  </PendingSubmitButton>
                </form>
              </div>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                className={`${actionBtn} border border-red-200 text-red-800`}
              >
                반려
              </button>
            </>
          )}
        </div>
      </footer>
    </main>
  );
}
