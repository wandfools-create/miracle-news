"use client";

import Link from "next/link";

import type { BulkCandidateEnrichSummary } from "@/lib/collection-candidates/candidateEnrichBulk";

type Props = {
  summary: BulkCandidateEnrichSummary;
  onRetryFailed: () => void;
  onDismiss: () => void;
};

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case "success":
      return "성공";
    case "already_enriched":
      return "이미 기사화";
    case "same_event_blocked":
      return "SAME EVENT 차단";
    case "status_blocked":
      return "상태 제외";
    case "enrich_failed":
      return "생성 실패";
    case "unexpected_error":
      return "예상하지 못한 오류";
    default:
      return outcome;
  }
}

export default function BulkCandidateEnrichResult({
  summary,
  onRetryFailed,
  onDismiss,
}: Props) {
  const failedCount = summary.enrichFailed + summary.unexpectedError;

  return (
    <div className="mb-4 rounded-2xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-base font-semibold">기사 만들기 결과</p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-gray-500 underline"
        >
          닫기
        </button>
      </div>

      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        <li>전체 선택: {summary.total}건</li>
        <li>성공: {summary.success}건</li>
        <li>이미 기사화: {summary.alreadyEnriched}건</li>
        <li>SAME EVENT 차단: {summary.sameEventBlocked}건</li>
        <li>상태 제외: {summary.statusBlocked}건</li>
        <li>생성 실패: {summary.enrichFailed}건</li>
        <li>예상하지 못한 오류: {summary.unexpectedError}건</li>
      </ul>

      <ul className="mt-4 space-y-2">
        {summary.results.map((r) => (
          <li
            key={r.candidateId}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2"
          >
            <p className="font-medium leading-snug">{r.candidateTitle || r.candidateId}</p>
            <p className="mt-0.5 text-xs text-gray-600">{outcomeLabel(r.outcome)}</p>
            {r.ok && r.articleId ? (
              <Link
                href={`/admin/review/${r.articleId}`}
                className="mt-1 inline-block text-xs font-medium text-green-800 underline"
              >
                검토 대기 기사 열기
              </Link>
            ) : null}
            {r.sameEventArticleId ? (
              <Link
                href={`/admin/published?published=${r.sameEventArticleId}`}
                className="mt-1 ml-2 inline-block text-xs font-medium text-amber-800 underline"
              >
                기존 기사 보기
              </Link>
            ) : null}
            {!r.ok && r.safeMessage ? (
              <p className="mt-1 text-xs text-red-700">
                {r.step ? `[${r.step}] ` : ""}
                {r.safeMessage}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {failedCount > 0 ? (
        <button
          type="button"
          onClick={onRetryFailed}
          className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100"
        >
          실패 항목만 다시 선택
        </button>
      ) : null}
    </div>
  );
}
