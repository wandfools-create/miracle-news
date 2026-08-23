import Link from "next/link";

import CollectionCandidatesWorkbench, {
  type WorkbenchCandidate,
} from "@/components/admin/CollectionCandidatesWorkbench";
import {
  CANDIDATE_CATEGORY_FILTERS,
  classifyCandidateCategory,
} from "@/lib/collection-candidates/candidateCategory";
import { fetchCollectionCandidates } from "@/lib/admin/fetchCollectionCandidates";
import {
  CANDIDATE_DATE_FILTERS,
  CANDIDATE_SOURCE_FILTERS,
  candidateListSearchParams,
} from "@/lib/collection-candidates/candidateListQuery";
import type { CollectionCandidateStatus } from "@/lib/collection-candidates/types";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type PageProps = {
  searchParams: Promise<{
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
    dismissError?: string;
    advanced?: string;
  }>;
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "actionable", label: "처리 대상" },
  { key: "pending", label: "수집 대기" },
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
  const dismissError = params.dismissError?.trim() || null;
  const showLocalizeTools = params.advanced?.trim() === "1";

  const { candidates, error, statusFilter, query } =
    await fetchCollectionCandidates({
      status: params.status,
      source: params.source,
      date: params.date,
      category: params.category,
    });

  const classified: WorkbenchCandidate[] = candidates.map((c) => {
    const candidateCategory = classifyCandidateCategory({
      source: c.source,
      rssTitle: c.rss_title,
      rssSummary: c.rss_summary,
    });
    return {
      id: c.id,
      source: c.source,
      feedLabel: c.feed_label,
      rssTitle: c.rss_title,
      rssSummary: c.rss_summary,
      hasKorean: Boolean(c.rss_title_ko?.trim()),
      originalUrl: c.original_url,
      rssPublishedAt: c.rss_published_at,
      status: c.status as CollectionCandidateStatus,
      enrichError: c.enrich_error,
      enrichStep: c.enrich_step,
      articleId: c.article_id,
      candidateCategory,
    };
  });

  const filtered =
    query.category === "all"
      ? classified
      : classified.filter((c) => c.candidateCategory === query.category);

  const categoryCounts = CANDIDATE_CATEGORY_FILTERS.map((tab) => {
    if (tab.key === "all") {
      return { ...tab, count: classified.length };
    }
    return {
      ...tab,
      count: classified.filter((c) => c.candidateCategory === tab.key).length,
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
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 수집 후보
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          후보 워크벤치
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          규칙 기반 카테고리·출처·날짜로 빠르게 걸러 보세요. 목록·필터·제외·미리보기에는
          OpenAI 비용이 없습니다. OpenAI는 「기사 만들기」·「한글화」에서만 호출됩니다.
        </p>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => {
            const active = query.status === tab.key;
            const href = `/admin/collection-candidates?${candidateListSearchParams({
              ...query,
              status: tab.key,
            })}${advancedSuffix}`;
            return (
              <Link
                key={tab.key}
                href={href}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition sm:text-sm ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

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

        <form
          method="get"
          action="/admin/collection-candidates"
          className="mt-4 flex flex-wrap items-end gap-3"
        >
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
          {" · "}상태 필터: {statusFilter}
        </p>

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
          </div>
        ) : null}

        {!error && filtered.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
            {statusFilter === "actionable"
              ? "처리할 후보가 없습니다. 다른 카테고리·출처를 선택해 보세요."
              : "이 필터에 해당하는 후보가 없습니다."}
          </div>
        ) : null}

        {!error && filtered.length > 0 ? (
          <div className="mt-5">
            <CollectionCandidatesWorkbench
              candidates={filtered}
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
