"use client";

import type {
  RecentRunLogSummary,
  RssSourceCollectHealth,
} from "@/lib/rss/fetchRssCollectHealthFromLogs";
import { formatDateTimeKo } from "@/lib/articleWorkflow";

type Props = {
  sources: RssSourceCollectHealth[];
  recentRuns: RecentRunLogSummary[];
};

export default function RssCollectionAccordion({ sources, recentRuns }: Props) {
  const okCount = sources.filter((s) => s.enabled && s.status === "ok").length;
  const errorCount = sources.filter(
    (s) => s.enabled && (s.status === "error" || s.retryState === "recent_failure")
  ).length;
  const lastCollectAt =
    recentRuns[0]?.at ??
    sources
      .map((s) => s.lastSuccessAt)
      .filter(Boolean)
      .sort()
      .reverse()[0] ??
    null;

  return (
    <details className="mb-4 rounded-xl border border-gray-200 bg-gray-50 group">
      <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-gray-600">
              RSS 수집망
            </p>
            <p className="mt-1 text-[11px] text-gray-600">
              정상 {okCount} · 오류 {errorCount}
              {lastCollectAt
                ? ` · 마지막 수집 ${formatDateTimeKo(lastCollectAt)}`
                : ""}
            </p>
            {recentRuns[0] ? (
              <p className="mt-1 text-[11px] text-gray-500">
                최근 회차: {recentRuns[0].status} · 저장 {recentRuns[0].savedCount}{" "}
                · 실패 {recentRuns[0].failedCount}
              </p>
            ) : null}
          </div>
          <span className="text-xs font-medium text-gray-500 group-open:hidden">
            펼치기
          </span>
          <span className="hidden text-xs font-medium text-gray-500 group-open:inline">
            접기
          </span>
        </div>
      </summary>

      <div className="border-t border-gray-200 px-4 py-3">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((row) => (
            <li
              key={`${row.sourceKey}::${row.feedUrl}`}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-900">
                  {row.label}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    row.status === "inactive"
                      ? "bg-neutral-200 text-neutral-700"
                      : row.status === "error"
                        ? "bg-red-100 text-red-800"
                        : row.status === "ok"
                          ? "bg-green-100 text-green-800"
                          : "bg-sky-50 text-sky-800"
                  }`}
                >
                  {row.status === "inactive"
                    ? "비활성"
                    : row.status === "error"
                      ? "오류"
                      : row.status === "ok"
                        ? "정상"
                        : "미확인"}
                </span>
              </div>
              <dl className="mt-2 space-y-1 text-[10px] text-gray-600">
                <div>
                  <dt className="inline font-semibold">마지막 성공: </dt>
                  <dd className="inline">
                    {row.lastSuccessAt ? formatDateTimeKo(row.lastSuccessAt) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">마지막 실패: </dt>
                  <dd className="inline">
                    {row.lastFailureAt ? formatDateTimeKo(row.lastFailureAt) : "—"}
                  </dd>
                </div>
                {row.lastFailureReason ? (
                  <div>
                    <dt className="font-semibold">실패 이유</dt>
                    <dd className="mt-0.5 line-clamp-3">{row.lastFailureReason}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="inline font-semibold">수집 기사: </dt>
                  <dd className="inline">{row.collectedCount}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">재시도: </dt>
                  <dd className="inline">
                    {row.retryState === "recent_failure" ? "최근 실패" : "대기"}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
