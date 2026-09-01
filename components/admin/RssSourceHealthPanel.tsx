"use client";

import { useId, useState } from "react";
import type {
  RecentRunLogSummary,
  RssSourceCollectHealth,
} from "@/lib/rss/fetchRssCollectHealthFromLogs";
import { formatCollectionRunTimeEt } from "@/lib/collection-candidates/groupCandidatesByRun";

type Props = {
  rows: RssSourceCollectHealth[];
  summary: {
    okCount: number;
    errorCount: number;
    unknownCount: number;
    inactiveCount: number;
    lastCollectAt: string | null;
  };
  recentRuns: RecentRunLogSummary[];
};

function statusLabel(status: RssSourceCollectHealth["status"]): string {
  switch (status) {
    case "ok":
      return "정상";
    case "error":
      return "오류";
    case "inactive":
      return "비활성";
    default:
      return "데이터 없음";
  }
}

function regionLabel(region: RssSourceCollectHealth["region"]): string {
  if (region === "korea") return "한국";
  if (region === "us-intl") return "미국·국제";
  return "—";
}

export default function RssSourceHealthPanel({
  rows,
  summary,
  recentRuns,
}: Props) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const latestRun = recentRuns[0] ?? null;

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-gray-600">
            RSS 수집망 상태
          </p>
          <p className="mt-1 text-[11px] leading-snug text-gray-500">
            정상 {summary.okCount} · 오류 {summary.errorCount}
            {summary.unknownCount > 0
              ? ` · 데이터 없음 ${summary.unknownCount}`
              : ""}
            {summary.inactiveCount > 0
              ? ` · 비활성 ${summary.inactiveCount}`
              : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            마지막 수집{" "}
            {summary.lastCollectAt
              ? formatCollectionRunTimeEt(summary.lastCollectAt)
              : "기록 없음"}
            {latestRun
              ? ` · 최근 회차 ${latestRun.status} (저장 ${latestRun.savedCount})`
              : ""}
          </p>
          <p className="mt-1 text-[10px] text-gray-400">
            데이터가 없으면 「정상」으로 표시하지 않습니다. 비밀값·원문은 숨깁니다.
          </p>
        </div>
        <button
          type="button"
          className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:bg-gray-200"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "접기" : "펼치기"}
        </button>
      </div>

      <div
        id={panelId}
        hidden={!expanded}
        className="mt-3 border-t border-gray-200 pt-3"
      >
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <li
              key={`${row.sourceKey}::${row.feedUrl}`}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-900">
                  {row.label}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    row.status === "ok"
                      ? "bg-emerald-50 text-emerald-800"
                      : row.status === "error"
                        ? "bg-red-50 text-red-800"
                        : row.status === "inactive"
                          ? "bg-neutral-200 text-neutral-700"
                          : "bg-amber-50 text-amber-900"
                  }`}
                >
                  {statusLabel(row.status)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-gray-500">
                {regionLabel(row.region)} · 최근 수집 {row.collectedCount} · 실패{" "}
                {row.failedCount}
                {row.retryState === "recent_failure" ? " · 재시도 대기" : ""}
              </p>
              <p className="mt-0.5 text-[10px] text-gray-500">
                성공{" "}
                {row.lastSuccessAt
                  ? formatCollectionRunTimeEt(row.lastSuccessAt)
                  : "—"}{" "}
                · 실패{" "}
                {row.lastFailureAt
                  ? formatCollectionRunTimeEt(row.lastFailureAt)
                  : "—"}
              </p>
              {row.lastFailureReason ? (
                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-red-700/80">
                  {row.lastFailureReason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
