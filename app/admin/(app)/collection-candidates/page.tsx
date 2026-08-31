import Link from "next/link";

import CandidateListScrollRestore from "@/components/admin/CandidateListScrollRestore";
import CollectionRunPanel from "@/components/admin/CollectionRunPanel";
import CollectionCandidatesWorkbench, {
  type WorkbenchCandidate,
} from "@/components/admin/CollectionCandidatesWorkbench";
import RecommendCandidatesForm from "@/components/admin/RecommendCandidatesForm";
import RssCollectionAccordion from "@/components/admin/RssCollectionAccordion";
import {
  filterCandidatesByRunKey,
  parseRunFilterParam,
  summarizeCollectionRuns,
} from "@/lib/collection-candidates/groupCandidatesByRun";
import {
  CANDIDATE_CATEGORY_FILTERS,
  classifyCandidateCategory,
} from "@/lib/collection-candidates/candidateCategory";
import {
  compareCandidatesByAiRecommend,
  normalizeAiRecommendGrade,
} from "@/lib/collection-candidates/candidateRecommend";
import { applyAiRecommendPostProcess } from "@/lib/collection-candidates/candidateRecommendPostProcess";
import { fetchCollectionCandidates } from "@/lib/admin/fetchCollectionCandidates";
import {
  CANDIDATE_DATE_FILTERS,
  CANDIDATE_SOURCE_FILTERS,
  CANDIDATE_VIEW_FILTERS,
  candidateListSearchParams,
} from "@/lib/collection-candidates/candidateListQuery";
import {
  batchRelatedStoriesForCandidates,
  loadRelatedStoryPool,
  type RelatedStoryRef,
} from "@/lib/same-event/relatedStories";
import type { CollectionCandidateStatus } from "@/lib/collection-candidates/types";
import {
  fetchRecentCollectionRunLogs,
  fetchRssCollectHealthFromLogs,
} from "@/lib/rss/fetchRssCollectHealthFromLogs";
import {
  RSS_FEED_SOURCES,
  isRssFeedSourceEnabled,
} from "@/lib/rss/feedSources";
import { Suspense } from "react";

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
    run?: string;
    pendingOnly?: string;
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

  const { candidates, error, statusFilter, query } =
    await fetchCollectionCandidates({
      view: params.view,
      status: params.status,
      source: params.source,
      date: params.date,
      category: params.category,
    });

  const runSummaries = summarizeCollectionRuns(
    candidates.map((c) => ({
      id: c.id,
      source: c.source,
      source_country: c.source_country,
      status: c.status as CollectionCandidateStatus,
      collection_run_id: c.collection_run_id,
      created_at: c.created_at,
      enrich_error: c.enrich_error,
    }))
  );
  const activeRunKey = parseRunFilterParam(params.run);
  const showPendingOnly = params.pendingOnly === "1";
  const runFilteredIds = new Set(
    filterCandidatesByRunKey(
      candidates.map((c) => ({
        id: c.id,
        source: c.source,
        source_country: c.source_country,
        status: c.status as CollectionCandidateStatus,
        collection_run_id: c.collection_run_id,
        created_at: c.created_at,
        enrich_error: c.enrich_error,
      })),
      activeRunKey
    ).map((row) => row.id)
  );
  const scopedCandidates = activeRunKey
    ? candidates.filter((c) => runFilteredIds.has(c.id))
    : candidates;

  const rssFeeds = RSS_FEED_SOURCES.map((feed) => ({
    sourceKey: feed.sourceKey,
    label: feed.label,
    feedUrl: feed.feedUrl,
    enabled: isRssFeedSourceEnabled(feed),
  }));
  const [rssHealth, recentRunLogs] = await Promise.all([
    fetchRssCollectHealthFromLogs(rssFeeds),
    fetchRecentCollectionRunLogs(),
  ]);

  const classified: WorkbenchCandidate[] = scopedCandidates.map((c) => {
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

  const filteredBase =
    query.view === "ai"
      ? [...byCategory].sort(compareCandidatesByAiRecommend)
      : byCategory;
  const filtered = showPendingOnly
    ? filteredBase.filter((c) => c.status === "pending")
    : filteredBase;

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

  const listQueryBase = candidateListSearchParams(query);
  const advancedSuffix = showLocalizeTools
    ? `${listQueryBase ? "&" : ""}advanced=1`
    : "";
  const advancedOnHref = `/admin/collection-candidates?${listQueryBase}${
    listQueryBase ? "&" : ""
  }advanced=1`;
  const advancedOffHref = `/admin/collection-candidates?${listQueryBase}`;

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
          <RssCollectionAccordion sources={rssHealth} recentRuns={recentRunLogs} />
          <Suspense fallback={null}>
            <CollectionRunPanel
              runs={runSummaries}
              activeRunKey={activeRunKey}
              showPendingOnly={showPendingOnly}
            />
          </Suspense>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {CANDIDATE_VIEW_FILTERS.map((tab) => {
            const active = query.view === tab.key;
            const href = `/admin/collection-candidates?${candidateListSearchParams({
              ...query,
              view: tab.key,
              status:
                tab.key === "older" || tab.key === "recent"
                  ? "pending"
                  : "actionable",
            })}${advancedSuffix}`;
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
            const href = `/admin/collection-candidates?${candidateListSearchParams({
              ...query,
              category: tab.key,
            })}${advancedSuffix}`;
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
            const href = `/admin/collection-candidates?${candidateListSearchParams({
              ...query,
              view: "ai",
              status: tab.key,
            })}${advancedSuffix}`;
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
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}
