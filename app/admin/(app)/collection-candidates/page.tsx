import Link from "next/link";

import CollectionCandidateCard from "@/components/admin/CollectionCandidateCard";
import LocalizeCandidatesForm from "@/components/admin/LocalizeCandidatesForm";
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
    made?: string;
    localized?: string;
    queued?: string;
    dismissed?: string;
    dismissError?: string;
    /** Show manual OpenAI localize tools (not default ops). */
    advanced?: string;
  }>;
};

const FILTER_TABS: Array<{
  key: string;
  label: string;
}> = [
  { key: "actionable", label: "처리 대상" },
  { key: "pending", label: "수집 대기" },
  { key: "enrich_failed", label: "보강 실패" },
  { key: "enriched", label: "보강 완료" },
  { key: "dismissed", label: "제외됨" },
  { key: "all", label: "전체" },
];

export default async function CollectionCandidatesPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const madeArticleId = params.made?.trim() || null;
  const localizedCount = params.localized?.trim() || null;
  const queuedCount = params.queued?.trim() || null;
  const dismissed = params.dismissed?.trim() || null;
  const dismissError = params.dismissError?.trim() || null;
  const showLocalizeTools = params.advanced?.trim() === "1";

  const { candidates, error, statusFilter, query } =
    await fetchCollectionCandidates({
      status: params.status,
      source: params.source,
      date: params.date,
    });

  const listQueryBase = candidateListSearchParams(query);
  const advancedOnHref = `/admin/collection-candidates?${listQueryBase}${
    listQueryBase ? "&" : ""
  }advanced=1`;
  const advancedOffHref = `/admin/collection-candidates?${listQueryBase}`;

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 수집 후보
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl">
          RSS 수집 후보
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600 sm:text-base">
          후보는 영어 원문 그대로 표시됩니다. 판단은 브라우저 자동 번역을
          사용하세요. 목록·필터·제외에는 OpenAI 비용이 없고, OpenAI는 「기사
          만들기」에서만 호출됩니다.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {FILTER_TABS.map((tab) => {
            const active = query.status === tab.key;
            const href = `/admin/collection-candidates?${candidateListSearchParams({
              ...query,
              status: tab.key,
            })}${showLocalizeTools ? "&advanced=1" : ""}`;
            return (
              <Link
                key={tab.key}
                href={href}
                className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
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

        <form
          method="get"
          action="/admin/collection-candidates"
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="status" value={query.status} />
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

        {showLocalizeTools ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-amber-950">
                고급: OpenAI 후보 한글화 (비용 발생)
              </p>
              <Link
                href={advancedOffHref}
                className="text-xs font-medium text-amber-900 underline"
              >
                기본 화면으로
              </Link>
            </div>
            <LocalizeCandidatesForm
              status={query.status}
              source={query.source}
              date={query.date}
            />
          </div>
        ) : (
          <p className="mt-4 text-xs text-gray-400">
            <Link href={advancedOnHref} className="underline hover:text-gray-600">
              고급: OpenAI 후보 한글화
            </Link>
            {" · "}필요 시에만 사용
          </p>
        )}

        {localizedCount ? (
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            후보 한글화 완료: {localizedCount}건 저장
            {queuedCount ? ` (요청 ${queuedCount}건, OpenAI 1회)` : ""}.
          </div>
        ) : null}

        {madeArticleId ? (
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            검토 대기에 저장했습니다.{" "}
            <Link
              href={`/admin/review/${madeArticleId}`}
              className="font-semibold underline"
            >
              검토 대기에서 보기
            </Link>
          </div>
        ) : null}

        {dismissed ? (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
            후보를 제외했습니다.
          </div>
        ) : null}

        {dismissError ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            제외하지 못했습니다. 이미 기사가 만들어졌거나 권한이 없을 수 있습니다.
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">후보 목록을 불러오지 못했습니다.</p>
            {error.code ? (
              <p className="mt-1 font-mono text-xs">code: {error.code}</p>
            ) : null}
            <p className="mt-2">{error.message}</p>
            {error.code === "42P01" || error.code === "42703" ? (
              <p className="mt-2 text-xs">
                <code className="rounded bg-red-100 px-1">
                  migrations/20260528_collection_candidates.sql
                </code>
                와{" "}
                <code className="rounded bg-red-100 px-1">
                  migrations/20260529_collection_candidates_ko.sql
                </code>
                을 Supabase에 적용했는지 확인하세요.
              </p>
            ) : null}
          </div>
        ) : null}

        {!error && candidates.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
            {statusFilter === "actionable"
              ? "처리할 후보가 없습니다. Vercel Production에 RSS_COLLECT_SAVE=1을 설정하면 Cron이 후보를 저장합니다."
              : "이 필터에 해당하는 후보가 없습니다."}
          </div>
        ) : null}

        <div className="mt-8 space-y-4">
          {candidates.map((c) => (
            <CollectionCandidateCard
              key={c.id}
              id={c.id}
              source={c.source}
              feedLabel={c.feed_label}
              rssTitle={c.rss_title}
              rssSummary={c.rss_summary}
              originalUrl={c.original_url}
              rssPublishedAt={c.rss_published_at}
              status={c.status as CollectionCandidateStatus}
              enrichError={c.enrich_error}
              enrichStep={c.enrich_step}
              articleId={c.article_id}
              createdAt={c.created_at}
              statusFilter={query.status}
              sourceFilter={query.source}
              dateFilter={query.date}
              showLocalizeTools={showLocalizeTools}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
