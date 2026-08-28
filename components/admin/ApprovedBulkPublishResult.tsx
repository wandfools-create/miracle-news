import Link from "next/link";
import type { ApprovedBulkPublishSummary } from "@/lib/admin/approvedBulkPublish";

type Props = {
  summary: ApprovedBulkPublishSummary;
};

export default function ApprovedBulkPublishResult({ summary }: Props) {
  const failures = summary.results.filter((r) => !r.ok && !r.excluded);
  const excluded = summary.results.filter((r) => !r.ok && r.excluded);
  const successes = summary.results.filter((r) => r.ok);

  return (
    <div className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-sm text-emerald-950">
      <p className="text-base font-semibold">일괄 공개 결과</p>
      {summary.displayedDetailCount < summary.totalResultCount ? (
        <p className="mt-1 text-xs text-emerald-900">
          전체 {summary.totalResultCount}건 중 상세 {summary.displayedDetailCount}
          건 표시 (실패·제외·SAME EVENT 경고 우선)
        </p>
      ) : null}
      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        <li>공개 성공: {summary.successCount}건</li>
        <li>
          SAME EVENT 경고 있었으나 사람 승인으로 공개:{" "}
          {summary.sameEventPublishedCount}건
        </li>
        <li>제외: {summary.excludedCount}건</li>
        <li>실패: {summary.failedCount}건</li>
      </ul>

      {successes.length > 0 ? (
        <div className="mt-4">
          <p className="font-medium">공개된 기사</p>
          <ul className="mt-2 space-y-1">
            {successes.map((r) =>
              r.ok ? (
                <li key={r.id}>
                  <Link
                    href={`/admin/published?published=${r.id}`}
                    className="underline"
                  >
                    {r.title}
                  </Link>
                  {r.sameEventNote ? (
                    <span className="ml-2 text-xs text-amber-800">
                      (SAME EVENT 유사 — 사람 승인 공개)
                    </span>
                  ) : null}
                  {r.alreadyPublished ? (
                    <span className="ml-2 text-xs text-gray-600">
                      (이미 공개됨)
                    </span>
                  ) : null}
                </li>
              ) : null
            )}
          </ul>
        </div>
      ) : null}

      {excluded.length > 0 ? (
        <div className="mt-4">
          <p className="font-medium text-amber-900">제외된 기사</p>
          <ul className="mt-2 space-y-1 text-amber-900">
            {excluded.map((r) =>
              !r.ok ? (
                <li key={r.id}>
                  {r.title || r.id}: {r.error}
                </li>
              ) : null
            )}
          </ul>
        </div>
      ) : null}

      {failures.length > 0 ? (
        <div className="mt-4">
          <p className="font-medium text-red-800">실패한 기사</p>
          <ul className="mt-2 space-y-1 text-red-800">
            {failures.map((r) =>
              !r.ok ? (
                <li key={r.id}>
                  {r.title || r.id}: [{r.step}] {r.error}
                </li>
              ) : null
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
