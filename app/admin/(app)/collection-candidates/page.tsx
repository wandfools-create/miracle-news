import Link from "next/link";
import { Suspense } from "react";

import CandidateListScrollRestore from "@/components/admin/CandidateListScrollRestore";
import CollectionCandidatesWorkbench, {
  type WorkbenchCandidate,
} from "@/components/admin/CollectionCandidatesWorkbench";
import CollectionRunPanel from "@/components/admin/CollectionRunPanel";
import RecommendCandidatesForm from "@/components/admin/RecommendCandidatesForm";
import RssSourceHealthPanel from "@/components/admin/RssSourceHealthPanel";
import {
  CANDIDATE_CATEGORY_FILTERS,
  classifyCandidateCategory,
} from "@/lib/collection-candidates/candidateCategory";
import {
  compareCandidatesByAiRecommend,
  normalizeAiRecommendGrade,
} from "@/lib/collection-candidates/candidateRecommend";
import { applyAiRecommendPostProcess } from "@/lib/collection-candidates/candidateRecommendPostProcess";
import {
  filterRunSummariesByRegion,
  inferCandidateCollectRegion,
  parseRegionFilterParam,
  parseRunFilterParam,
  runKeyForCandidate,
  summarizeCollectionRuns,
} from "@/lib/collection-candidates/groupCandidatesByRun";
import { fetchCollectionCandidates } from "@/lib/admin/fetchCollectionCandidates";
import {
  fetchCandidateRunIndex,
  fetchRecentCollectionRuns,
} from "@/lib/admin/fetchCollectionRuns";
import {
  CANDIDATE_DATE_FILTERS,
  CANDIDATE_SOURCE_FILTERS,
  CANDIDATE_VIEW_FILTERS,
  candidateListSearchParams,
} from "@/lib/collection-candidates/candidateListQuery";
import {
  fetchRecentCollectionRunLogs,
  fetchRssCollectHealthFromLogs,
  summarizeRssHealth,
} from "@/lib/rss/fetchRssCollectHealthFromLogs";
import {
  batchRelatedStoriesForCandidates,
  loadRelatedStoryPool,
  type RelatedStoryRef,
} from "@/lib/same-event/relatedStories";
import type { CollectionCandidateStatus } from "@/lib/collection-candidates/types";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type PageProps = {
  searchParams: Promise<{
    view?: string;
    status?: string;
    source?: string;
    date?: string;
    category?: string;
    run?: string;
    runRegion?: string;
    pendingOnly?: string;
    made?: string;
    bulkMade?: string;
    localized?: string;
    queued?: string;
    dismissed?: string;
    expired?: string;
    shortlisted?: string;
    dismissError?: string;
    recommended?: string;
    recommendQueued?: string;
    advanced?: string;
  }>;
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "actionable", label: "처리 대상" },
  { key: "pending", label: "수집 대기" },
  { key: "shortlisted", label: "선정됨" },
  { key: "enrich_failed", label: "보강 실패" },
  { key: "enriched", label: "보강 완료" },
  { key: "dismissed", label: "제외됨" },
  { key: "all", label: "전체 상태" },
];

export default async function CollectionCandidatesPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const madeArticleId = params.made?.trim() || null;
  const bulkMade = params.bulkMade?.trim() || null;
  const localizedCount = params.localized?.trim() || null;
  const queuedCount = params.queued?.trim() || null;
  const dismissed = params.dismissed?.trim() || null;
  const expired = params.expired?.trim() || null;
  const shortlistedFlash = params.shortlisted?.trim() || null;
  const dismissError = params.dismissError?.trim() || null;
  const recommended = params.recommended?.trim() || null;
  const recommendQueued = params.recommendQueued?.trim() || null;
  const showLocalizeTools = params.advanced?.trim() === "1";
  const activeRunKey = parseRunFilterParam(params.run);
  const regionFilter = parseRegionFilterParam(params.runRegion);
  const showPendingOnly =
    params.pendingOnly === "1" || params.pendingOnly === "true";

  const [
    { candidates, error, statusFilter, query },
    runIndex,
    storedRunsResult,
    rssHealthRows,
    recentRunLogs,
  ] = await Promise.all([
    fetchCollectionCandidates({
      view: params.view,
      status: params.status,
      source: params.source,
      date: params.date,
      category: params.category,
    }),
    fetchCandidateRunIndex({ view: params.view }),
    fetchRecentCollectionRuns(),
    fetchRssCollectHealthFromLogs(),
    fetchRecentCollectionRunLogs(),
  ]);

  const rssHealthSummary = summarizeRssHealth(rssHealthRows);

  const runSummariesAll = summarizeCollectionRuns(
    runIndex,
    storedRunsResult.runs.map((r) => ({
      id: r.id,
      region: r.region,
      started_at: r.started_at,
      finished_at: r.finished_at,
      status: r.status,
      collected_count: r.collected_count,
      new_candidate_count: r.new_candidate_count,
      duplicate_count: r.duplicate_count,
      failed_count: r.failed_count,
    }))
  );
  const runSummaries = filterRunSummariesByRegion(
    runSummariesAll,
    regionFilter
  );

  const classified: WorkbenchCandidate[] = candidates.map((c) => {
    const candidateCategory = classifyCandidateCategory({
      source: c.source,
      rssTitle: c.rss_title,
      rssSummary: c.rss_summary,
      category: c.category,
    });
    const aiRecommendGrade = normalizeAiRecommendGrade(c.ai_recommend_grade);
    return {
      id: c.id,
      source: c.source,
      feedLabel: c.feed_label,
      rssTitle: c.rss_title,
      rssSummary: c.rss_summary,
      hasKorean: Boolean(c.rss_title_ko?.trim()),
      originalUrl: c.original_url,
      rssPublishedAt: c.rss_published_at,
      createdAt: c.created_at,
      status: c.status as CollectionCandidateStatus,
      enrichError: c.enrich_error,
      enrichStep: c.enrich_step,
      articleId: c.article_id,
      candidateCategory,
      aiRecommendGrade,
      aiRecommendScore:
        typeof c.ai_recommend_score === "number" ? c.ai_recommend_score : null,
      aiRecommendReason: c.ai_recommend_reason,
    };
  });

  const candidateRunMeta = new Map(
    candidates.map((c) => [
      c.id,
      {
        id: c.id,
        source: c.source,
        source_country: c.source_country,
        status: c.status as CollectionCandidateStatus,
        collection_run_id: c.collection_run_id,
        created_at: c.created_at,
        enrich_error: c.enrich_error,
        discord_brief_sent_at: c.discord_brief_sent_at,
      },
    ])
  );

  const postProcessedById = new Map(
    applyAiRecommendPostProcess(
      classified
        .filter((c) => c.aiRecommendGrade)
        .map((c) => ({
          id: c.id,
          grade: c.aiRecommendGrade!,
          score: c.aiRecommendScore ?? 0,
          reason: c.aiRecommendReason ?? "",
          title: c.rssTitle,
          summary: c.rssSummary ?? "",
          source: c.source,
          originalUrl: c.originalUrl,
          rssPublishedAt: c.rssPublishedAt,
          createdAt: c.createdAt,
        }))
    ).map((item) => [item.id, item])
  );

  const classifiedWithPostProcess: WorkbenchCandidate[] = classified.map((c) => {
    const adjusted = postProcessedById.get(c.id);
    if (!adjusted) return c;
    return {
      ...c,
      aiRecommendGrade: adjusted.grade,
      aiRecommendScore: adjusted.score,
      aiRecommendReason: adjusted.reason,
    };
  });

  const byCategory =
    query.category === "all"
      ? classifiedWithPostProcess
      : classifiedWithPostProcess.filter(
          (c) => c.candidateCategory === query.category
        );

  const byRegion =
    regionFilter === "all"
      ? byCategory
      : byCategory.filter((c) => {
          const meta = candidateRunMeta.get(c.id);
          if (!meta) return false;
          return inferCandidateCollectRegion(meta) === regionFilter;
        });

  const byRun = activeRunKey
    ? byRegion.filter((c) => {
        const meta = candidateRunMeta.get(c.id);
        if (!meta) return false;
        return runKeyForCandidate(meta) === activeRunKey;
      })
    : byRegion;

  const byPending = showPendingOnly
    ? byRun.filter((c) => c.status === "pending")
    : byRun;

  const filtered =
    query.view === "ai"
      ? [...byPending].sort(compareCandidatesByAiRecommend)
      : byPending;

  let relatedStoriesMap: Record<string, RelatedStoryRef[]> = {};
  let relatedStoryPoolCapped = false;

  try {
    const { pool, poolCapped } = await loadRelatedStoryPool();
    relatedStoryPoolCapped = poolCapped;
    const relatedByCandidateId = batchRelatedStoriesForCandidates(
      filtered.map((c) => ({
        id: c.id,
        source: c.source,
        rssTitle: c.rssTitle,
        rssSummary: c.rssSummary,
        rssPublishedAt: c.rssPublishedAt,
        articleId: c.articleId,
      })),
      pool
    );
    relatedStoriesMap = Object.fromEntries(relatedByCandidateId.entries());
  } catch (err) {
    console.warn("[collection-candidates] related stories failed", err);
  }

  const unevaluatedCount = classifiedWithPostProcess.filter(
    (c) => !c.aiRecommendGrade
  ).length;

  const categoryCounts = CANDIDATE_CATEGORY_FILTERS.map((tab) => {
    if (tab.key === "all") {
      return { ...tab, count: classifiedWithPostProcess.length };
    }
    return {
      ...tab,
      count: classifiedWithPostProcess.filter(
        (c) => c.candidateCategory === tab.key
      ).length,
    };
  });

  const withFilters = (
    patch: Record<string, string | null | undefined>,
    baseQuery = query
  ) => {
    const params = new URLSearchParams(candidateListSearchParams(baseQuery));
    if (activeRunKey) params.set("run", activeRunKey);
    if (regionFilter !== "all") params.set("runRegion", regionFilter);
    if (showPendingOnly) params.set("pendingOnly", "1");
    if (showLocalizeTools) params.set("advanced", "1");
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const q = params.toString();
    return q
      ? `/admin/collection-candidates?${q}`
      : "/admin/collection-candidates";
  };
  const advancedOnHref = withFilters({ advanced: "1" });
  const advancedOffHref = withFilters({ advanced: null });

  return (
    <main className="min-h-screen bg-white text-black">
      <CandidateListScrollRestore />
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 수집 후보
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          후보 워크벤치
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          기본은 AI 추천 우선 보기입니다. 쓸 만한 후보는{" "}
          <Link
            href="/admin/collection-shortlist"
            className="font-semibold text-violet-800 underline"
          >
            편집 보관함
          </Link>
          에 담아 두고, 그다음 기사 만들기를 실행하세요. 「AI 추천 갱신」은
          저비용 모델로 제목·요약만 평가합니다.
        </p>

        <div className="mt-4">
          <RssSourceHealthPanel
            rows={rssHealthRows}
            summary={rssHealthSummary}
            recentRuns={recentRunLogs}
          />
        </div>

        <Suspense
          fallback={
            <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
              수집 회차 로딩…
            </div>
          }
        >
          <CollectionRunPanel
            runs={runSummaries}
            activeRunKey={activeRunKey}
            regionFilter={regionFilter}
            showPendingOnly={showPendingOnly}
          />
        </Suspense>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {CANDIDATE_VIEW_FILTERS.map((tab) => {
            const active = query.view === tab.key;
            const href = withFilters(
              {},
              {
                ...query,
                view: tab.key,
                status:
                  tab.key === "older" || tab.key === "recent"
                    ? "pending"
                    : "actionable",
              }
            );
            return (
              <Link
                key={tab.key}
                href={href}
                data-cc-filter-nav="1"
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "border-violet-800 bg-violet-800 text-white"
                    : "border-gray-300 text-gray-800 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {query.view === "ai" ? (
          <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
            <RecommendCandidatesForm
              view={query.view}
              status={query.status}
              source={query.source}
              date={query.date}
              category={query.category}
              advanced={showLocalizeTools}
              unevaluatedCount={unevaluatedCount}
            />
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {categoryCounts.map((tab) => {
            const active = query.category === tab.key;
            const href = withFilters({}, { ...query, category: tab.key });
            return (
              <Link
                key={tab.key}
                href={href}
                data-cc-filter-nav="1"
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition sm:text-sm ${
                  active
                    ? "border-sky-700 bg-sky-700 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab.label}
                <span className="ml-1 opacity-70">{tab.count}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => {
            const active = query.status === tab.key && query.view === "ai";
            const href = withFilters(
              {},
              { ...query, view: "ai", status: tab.key }
            );
            return (
              <Link
                key={tab.key}
                href={href}
                data-cc-filter-nav="1"
                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
                  active
                    ? "border-gray-800 bg-gray-800 text-white"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <form
          method="get"
          action="/admin/collection-candidates"
          data-cc-filter-nav="1"
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="view" value={query.view} />
          <input type="hidden" name="status" value={query.status} />
          <input type="hidden" name="category" value={query.category} />
          {activeRunKey ? (
            <input type="hidden" name="run" value={activeRunKey} />
          ) : null}
          {regionFilter !== "all" ? (
            <input type="hidden" name="runRegion" value={regionFilter} />
          ) : null}
          {showPendingOnly ? (
            <input type="hidden" name="pendingOnly" value="1" />
          ) : null}
          {showLocalizeTools ? (
            <input type="hidden" name="advanced" value="1" />
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            출처
            <select
              name="source"
              defaultValue={query.source}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {CANDIDATE_SOURCE_FILTERS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            날짜
            <select
              name="date"
              defaultValue={query.date}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {CANDIDATE_DATE_FILTERS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            필터 적용
          </button>
        </form>

        <p className="mt-3 text-xs text-gray-400">
          {showLocalizeTools ? (
            <Link href={advancedOffHref} className="underline hover:text-gray-600">
              기본 화면으로 (한글화 숨김)
            </Link>
          ) : (
            <Link href={advancedOnHref} className="underline hover:text-gray-600">
              고급: OpenAI 후보 한글화
            </Link>
          )}
          {" · "}
          {query.view === "recent"
            ? "전체 = 최근 48시간 pending"
            : query.view === "older"
              ? "이전 후보 = 48시간 초과 pending"
              : `AI 추천 · 상태 ${statusFilter}`}
        </p>

        {recommended != null ? (
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
            AI 추천 갱신 완료: {recommended}건 저장
            {recommendQueued ? ` (요청 ${recommendQueued}건)` : ""}.
          </div>
        ) : null}

        {localizedCount ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            후보 한글화 완료: {localizedCount}건 저장
            {queuedCount ? ` (요청 ${queuedCount}건, OpenAI 1회)` : ""}.
          </div>
        ) : null}

        {madeArticleId || bulkMade ? (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            {bulkMade ? `기사 만들기 ${bulkMade}건 완료. ` : null}
            {madeArticleId ? (
              <>
                검토 대기:{" "}
                <Link
                  href={`/admin/review/${madeArticleId}`}
                  className="font-semibold underline"
                >
                  최근 저장분 보기
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        {shortlistedFlash ? (
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
            편집 보관함에{" "}
            {shortlistedFlash === "1" ? "담았습니다" : `${shortlistedFlash}건 담았습니다`}.{" "}
            <Link href="/admin/collection-shortlist" className="font-semibold underline">
              보관함 열기
            </Link>
          </div>
        ) : null}

        {dismissed ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
            후보 {dismissed === "1" ? "" : `${dismissed}건 `}제외했습니다.
          </div>
        ) : null}

        {expired ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
            후보 {expired}건을 보관/만료 처리했습니다.
          </div>
        ) : null}

        {dismissError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            일괄/제외 처리에 실패했습니다. 이미 기사가 연결됐거나 권한이 없을 수
            있습니다.
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-semibold">후보 목록을 불러오지 못했습니다.</p>
            <p className="mt-1">{error.message}</p>
            {error.code === "42703" ? (
              <p className="mt-2 text-xs">
                AI 추천 컬럼이 없으면{" "}
                <code className="rounded bg-red-100 px-1">
                  migrations/20260824_collection_candidates_ai_recommend.sql
                </code>
                을 Supabase에 적용하세요.
              </p>
            ) : null}
          </div>
        ) : null}

        {!error && filtered.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
            {query.view === "ai"
              ? "표시할 후보가 없습니다. RSS 수집 후 「AI 추천 갱신」을 눌러 보세요."
              : query.view === "older"
                ? "48시간을 넘긴 pending 후보가 없습니다."
                : "최근 48시간 pending 후보가 없습니다."}
          </div>
        ) : null}

        {!error && filtered.length > 0 ? (
          <div className="mt-5">
            <CollectionCandidatesWorkbench
              candidates={filtered}
              relatedStoriesMap={relatedStoriesMap}
              relatedStoryPoolCapped={relatedStoryPoolCapped}
              viewFilter={query.view}
              statusFilter={query.status}
              sourceFilter={query.source}
              dateFilter={query.date}
              categoryFilter={query.category}
              showLocalizeTools={showLocalizeTools}
              runFilter={activeRunKey}
              runRegionFilter={regionFilter === "all" ? null : regionFilter}
              pendingOnly={showPendingOnly}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}
