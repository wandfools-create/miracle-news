"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { CollectionRunSummary } from "@/lib/collection-candidates/groupCandidatesByRun";
import {
  collectionRunRegionLabel,
  collectionRunStatusLabel,
  formatCollectionRunTimeEt,
} from "@/lib/collection-candidates/groupCandidatesByRun";
import { RSS_FEED_SOURCES } from "@/lib/rss/feedSources";
import {
  COLLECT_RUN_SUMMARY_STAT_LABELS,
  displayExclusionStat,
  displayUnprocessed,
  formatExclusionStatDisplay,
  reconcileCollectRunStats,
  stableFeedKey,
  type CollectRunExclusionStats,
  type CollectRunSummaryStatKey,
  type CollectSourceStatRow,
} from "@/lib/rss/collectRunExclusionStats";

type Props = {
  runs: CollectionRunSummary[];
  activeRunKey: string | null;
  regionFilter: "all" | "korea" | "us-intl";
  showPendingOnly: boolean;
  /** When true, expand the latest run section (default). */
  expandLatest?: boolean;
};

function buildHref(
  pathname: string,
  params: URLSearchParams,
  patch: Record<string, string | null>
) {
  const next = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (!value) next.delete(key);
    else next.set(key, value);
  }
  const q = next.toString();
  return q ? `${pathname}?${q}` : pathname;
}

const STAGE_KEYS: CollectRunSummaryStatKey[] = [
  "rssReceived",
  "dateOkWithin72h",
  "saved",
];

const REASON_KEYS: CollectRunSummaryStatKey[] = [
  "feedFetchFailed",
  "undated",
  "olderThan72h",
  "duplicateUrl",
  "feedOrSourceCap",
  "fieldCountryKeyword",
  "otherSkipped",
  "saveFailed",
];

function sourceLabel(sourceKey: string): string {
  const hit = RSS_FEED_SOURCES.find((f) => f.sourceKey === sourceKey);
  if (!hit) return sourceKey;
  return hit.label.split("·")[0]?.trim() || sourceKey;
}

function feedLabel(sourceKey: string, feedKey: string, category: string | null): string {
  const match = RSS_FEED_SOURCES.find(
    (f) => f.sourceKey === sourceKey && stableFeedKey(f.feedUrl) === feedKey
  );
  if (match) return match.label;
  if (category) return `${sourceKey} · ${category}`;
  return `${sourceKey} · ${feedKey}`;
}

export default function CollectionRunPanel({
  runs,
  activeRunKey,
  regionFilter,
  showPendingOnly,
  expandLatest = true,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [latest, ...older] = runs;

  return (
    <section
      aria-label="수집 회차"
      className="mb-4 rounded-xl border border-gray-200 bg-white px-3 py-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-gray-600">
          수집 회차 · 제외 이유
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref(pathname, searchParams, {
              run: null,
              runRegion: null,
              pendingOnly: null,
            })}
            className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[0.98] ${
              !activeRunKey && regionFilter === "all" && !showPendingOnly
                ? "border-black bg-black text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            전체 보기
          </Link>
          {latest ? (
            <Link
              href={buildHref(pathname, searchParams, {
                run: latest.runKey,
                runRegion: null,
              })}
              className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[0.98] ${
                activeRunKey === latest.runKey
                  ? "border-violet-800 bg-violet-800 text-white"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              최신 회차
            </Link>
          ) : null}
          <Link
            href={buildHref(pathname, searchParams, {
              runRegion: "korea",
              run: null,
            })}
            className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[0.98] ${
              regionFilter === "korea"
                ? "border-sky-700 bg-sky-700 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            한국
          </Link>
          <Link
            href={buildHref(pathname, searchParams, {
              runRegion: "us-intl",
              run: null,
            })}
            className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[0.98] ${
              regionFilter === "us-intl"
                ? "border-sky-700 bg-sky-700 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            미국·국제
          </Link>
          <Link
            href={buildHref(pathname, searchParams, {
              pendingOnly: showPendingOnly ? null : "1",
            })}
            className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[0.98] ${
              showPendingOnly
                ? "border-amber-700 bg-amber-700 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            미확인만
          </Link>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-gray-500">
        시각은 미국 동부시간(America/New_York, DST 반영)입니다. 상세 집계는
        migration 적용 후 새 회차부터 기록됩니다. 과거 회차는 「기록 없음」입니다.
        회차 처리 한도 때문에 검사하지 못한 항목은 「제외」가 아니라 「미처리」입니다.
      </p>

      {latest && expandLatest ? (
        <RunRow
          run={latest}
          active={activeRunKey === latest.runKey}
          href={buildHref(pathname, searchParams, { run: latest.runKey })}
          defaultOpen
        />
      ) : !latest ? (
        <p className="mt-2 text-xs text-gray-500">표시할 회차가 없습니다.</p>
      ) : null}

      {older.length > 0 ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none rounded-md px-1 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black [&::-webkit-details-marker]:hidden">
            <span className="underline-offset-2 group-open:underline">
              이전 회차 {older.length}건 (기본 접힘)
            </span>
          </summary>
          <ul className="mt-2 space-y-2">
            {older.map((run) => (
              <li key={run.runKey}>
                <RunRow
                  run={run}
                  active={activeRunKey === run.runKey}
                  href={buildHref(pathname, searchParams, { run: run.runKey })}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function RunRow({
  run,
  active,
  href,
  defaultOpen = false,
}: {
  run: CollectionRunSummary;
  active: boolean;
  href: string;
  defaultOpen?: boolean;
}) {
  const progress =
    run.total > 0 ? Math.round((run.processed / run.total) * 100) : 0;
  const kindLabel = run.kind === "real" ? "실제 회차" : "추정 회차";
  const stats = run.exclusionStats ?? null;
  const categoryEntries = stats
    ? Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])
    : null;
  const reconcile = stats ? reconcileCollectRunStats(stats) : null;
  const tone = active
    ? "border-black bg-neutral-900 text-white shadow-sm"
    : "border-gray-200 bg-gray-50 text-gray-800";
  const muted = active ? "text-white/70" : "text-gray-500";
  const body = active ? "text-white/90" : "text-gray-700";

  return (
    <div
      data-open={defaultOpen ? "1" : undefined}
      className={`mt-2 rounded-lg border px-3 py-2.5 text-xs ${tone}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={href}
          aria-current={active ? "true" : undefined}
          className="cursor-pointer font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
        >
          {formatCollectionRunTimeEt(run.startedAt)}
        </Link>
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              active
                ? "bg-white/20 text-white"
                : run.kind === "real"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-900"
            }`}
          >
            {kindLabel}
          </span>
          <span>{collectionRunRegionLabel(run.region)}</span>
        </span>
      </div>
      {run.finishedAt ? (
        <p className={`mt-1 ${active ? "opacity-90" : "text-gray-600"}`}>
          종료 {formatCollectionRunTimeEt(run.finishedAt)}
        </p>
      ) : null}
      <p className="mt-1 opacity-90">
        수집 {run.collectedCount} · 신규 {run.newCandidates} · 미확인{" "}
        {run.pending} · 기사화 {run.articleized} · 제외 {run.dismissed} · 실패{" "}
        {run.failed}
        {run.discordNotified != null
          ? ` · Discord ${run.discordNotified}`
          : ""}
      </p>
      <p className="mt-1">
        진행 {progress}% · {collectionRunStatusLabel(run.status)}
      </p>

      <RunLimitBlock stats={stats} muted={muted} body={body} />

      <p className={`mt-2 text-[11px] font-semibold ${body}`}>진행 단계</p>
      <div className={`mt-1 grid gap-1 sm:grid-cols-2 ${body}`}>
        {STAGE_KEYS.map((key) => (
          <StatLine
            key={key}
            label={COLLECT_RUN_SUMMARY_STAT_LABELS[key]}
            value={formatExclusionStatDisplay(displayExclusionStat(stats, key))}
            muted={muted}
          />
        ))}
      </div>

      <p className={`mt-2 text-[11px] font-semibold ${body}`}>
        제외 이유 (기사당 최종 1개)
      </p>
      <div className={`mt-1 grid gap-1 sm:grid-cols-2 ${body}`}>
        {REASON_KEYS.map((key) => (
          <StatLine
            key={key}
            label={COLLECT_RUN_SUMMARY_STAT_LABELS[key]}
            value={formatExclusionStatDisplay(displayExclusionStat(stats, key))}
            muted={muted}
          />
        ))}
        <StatLine
          label="미처리 (회차 처리 한도 등)"
          value={formatExclusionStatDisplay(displayUnprocessed(stats))}
          muted={muted}
        />
      </div>

      {reconcile && !reconcile.balanced ? (
        <p className={`mt-2 text-[11px] ${muted}`}>
          합계 불일치:{" "}
          <span className="font-semibold">미처리/기록 없음</span>
          {reconcile.receivedStageGap != null && reconcile.receivedStageGap !== 0
            ? ` · 수신 단계 차이 ${reconcile.receivedStageGap}`
            : ""}
          {reconcile.dateStageGap != null && reconcile.dateStageGap !== 0
            ? ` · 날짜통과 단계 차이 ${reconcile.dateStageGap}`
            : ""}
        </p>
      ) : null}

      <p className={`mt-2 text-[11px] ${active ? "text-white/80" : "text-gray-600"}`}>
        분야별 후보 수:{" "}
        {categoryEntries == null ? (
          <span className="font-semibold">기록 없음</span>
        ) : categoryEntries.length === 0 ? (
          <span className="font-semibold">0</span>
        ) : (
          categoryEntries.map(([cat, n]) => `${cat} ${n}`).join(" · ")
        )}
      </p>

      <SourceStatsBlock stats={stats} muted={muted} body={body} />
    </div>
  );
}

function StatLine({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted: string;
}) {
  return (
    <p className="text-[11px] leading-snug">
      <span className={muted}>{label}</span>
      {": "}
      <span className="font-semibold">{value}</span>
    </p>
  );
}

function RunLimitBlock({
  stats,
  muted,
  body,
}: {
  stats: CollectRunExclusionStats | null;
  muted: string;
  body: string;
}) {
  if (!stats) {
    return (
      <p className={`mt-2 text-[11px] ${body}`}>
        <span className={muted}>회차 처리 한도</span>
        {": "}
        <span className="font-semibold">기록 없음</span>
      </p>
    );
  }
  const { configured, used, reached, unprocessed } = stats.runLimit;
  return (
    <div className={`mt-2 text-[11px] ${body}`}>
      <p>
        <span className={muted}>회차 처리 한도</span>
        {": "}
        <span className="font-semibold">
          설정 {configured} · 사용 {used} ·{" "}
          {reached ? "한도 도달" : "한도 미도달"}
        </span>
      </p>
      <p className="mt-0.5">
        <span className={muted}>한도로 미처리</span>
        {": "}
        <span className="font-semibold">
          {unprocessed == null
            ? "미처리/기록 없음"
            : reached
              ? String(unprocessed)
              : unprocessed > 0
                ? String(unprocessed)
                : "0"}
        </span>
      </p>
    </div>
  );
}

function SourceStatsBlock({
  stats,
  muted,
  body,
}: {
  stats: CollectRunExclusionStats | null;
  muted: string;
  body: string;
}) {
  if (!stats) {
    return (
      <p className={`mt-2 text-[11px] ${body}`}>
        언론사별 통계: <span className="font-semibold">기록 없음</span>
      </p>
    );
  }
  if (stats.sources.length === 0) {
    return (
      <p className={`mt-2 text-[11px] ${body}`}>
        언론사별 통계: <span className="font-semibold">0</span>
      </p>
    );
  }

  return (
    <details className="mt-2">
      <summary
        className={`cursor-pointer list-none text-[11px] font-semibold ${body} [&::-webkit-details-marker]:hidden`}
      >
        언론사별 통계 {stats.sources.length}곳 (펼치기)
      </summary>
      <ul className="mt-2 space-y-2">
        {stats.sources.map((source) => (
          <li
            key={source.sourceKey}
            className={`rounded-md border px-2 py-1.5 ${
              muted.includes("white")
                ? "border-white/20 bg-white/5"
                : "border-gray-200 bg-white"
            }`}
          >
            <SourceCard source={source} muted={muted} body={body} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function SourceCard({
  source,
  muted,
  body,
}: {
  source: CollectSourceStatRow;
  muted: string;
  body: string;
}) {
  return (
    <div className={body}>
      <p className="font-semibold">{sourceLabel(source.sourceKey)}</p>
      <p className={`mt-0.5 text-[10px] ${muted}`}>
        성공{" "}
        {source.lastSuccessAt
          ? formatCollectionRunTimeEt(source.lastSuccessAt)
          : "기록 없음"}{" "}
        · 실패{" "}
        {source.lastFailureAt
          ? formatCollectionRunTimeEt(source.lastFailureAt)
          : "기록 없음"}
      </p>
      <SourceMetricGrid source={source} muted={muted} />
      {source.feeds.length > 1 ? (
        <ul className="mt-1.5 space-y-1 border-t border-dashed border-gray-300/40 pt-1.5">
          {source.feeds.map((feed) => (
            <li key={feed.feedKey} className="text-[10px]">
              <p className="font-medium">
                피드 ·{" "}
                {feedLabel(source.sourceKey, feed.feedKey, feed.category)}
              </p>
              <SourceMetricGrid source={feed} muted={muted} compact />
            </li>
          ))}
        </ul>
      ) : source.feeds.length === 1 ? (
        <p className={`mt-1 text-[10px] ${muted}`}>
          피드 1개 ·{" "}
          {feedLabel(
            source.sourceKey,
            source.feeds[0]!.feedKey,
            source.feeds[0]!.category
          )}
        </p>
      ) : null}
    </div>
  );
}

function SourceMetricGrid({
  source,
  muted,
  compact = false,
}: {
  source: {
    rssReceived: number;
    dateOkWithin72h: number;
    undated: number;
    olderThan72h: number;
    duplicateUrl: number;
    feedOrSourceCap: number;
    fieldCountryKeyword: number;
    saved: number;
    saveFailed: number;
  };
  muted: string;
  compact?: boolean;
}) {
  const rows: Array<[string, number]> = [
    ["RSS 수신", source.rssReceived],
    ["날짜 정상·72시간 이내", source.dateOkWithin72h],
    ["날짜 없음/파싱 실패", source.undated],
    ["72시간 초과", source.olderThan72h],
    ["중복", source.duplicateUrl],
    ["피드/출처 제한", source.feedOrSourceCap],
    ["분야·국가·키워드 제외", source.fieldCountryKeyword],
    ["후보 저장", source.saved],
    ["저장 실패", source.saveFailed],
  ];
  return (
    <div
      className={`mt-1 grid gap-x-2 gap-y-0.5 ${
        compact ? "grid-cols-2" : "sm:grid-cols-2"
      }`}
    >
      {rows.map(([label, value]) => (
        <p key={label} className="text-[10px] leading-snug">
          <span className={muted}>{label}</span>:{" "}
          <span className="font-semibold">{value}</span>
        </p>
      ))}
    </div>
  );
}
