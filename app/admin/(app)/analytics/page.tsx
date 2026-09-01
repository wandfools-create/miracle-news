import Link from "next/link";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import { fetchAnalyticsAdminSummary } from "@/lib/analytics/fetchAnalyticsAdminSummary";
import { getSourceLabel } from "@/lib/koreanArticleDisplay";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ days?: string }>;
};

function parseDays(raw: string | undefined): 1 | 7 | 30 {
  const value = Number(raw ?? 7);
  if (value === 1 || value === 30) return value;
  return 7;
}

function formatPeriodLabel(days: 1 | 7 | 30): string {
  if (days === 1) return "오늘";
  return `최근 ${days}일`;
}

function articleTitle(
  row: {
    koTitle: string | null;
    enTitle: string | null;
    articleId: string;
  },
  preferred: "ko" | "en"
): string {
  const title =
    preferred === "ko"
      ? row.koTitle ?? row.enTitle
      : row.enTitle ?? row.koTitle;
  if (title) return title;
  return `기사 (${row.articleId.slice(0, 8)}…)`;
}

function articlePublicHref(row: {
  koSlug: string | null;
  enSlug: string | null;
  koTitle: string | null;
}): string | null {
  if (row.koSlug) return `/ko/article/${row.koSlug}`;
  if (row.enSlug) return `/en/article/${row.enSlug}`;
  return null;
}

export default async function AnalyticsAdminPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const days = parseDays(params.days);
  const result = await fetchAnalyticsAdminSummary(days);

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-black sm:px-6">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold text-gray-500">관리자 / 방문 분석</p>
        <h1 className="mt-2 text-2xl font-bold">방문 분석</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          IP·전체 user-agent·임의 metadata는 저장하지 않습니다. 익명 방문 세션은
          브라우저 localStorage 기반 24시간 단위 추정치이며 실제 방문자 수와
          같지 않습니다. Preview·봇 방문은 통계를 왜곡할 수 있습니다.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {[1, 7, 30].map((d) => (
            <Link
              key={d}
              href={`/admin/analytics?days=${d}`}
              className={`rounded-full px-3 py-1 font-semibold ${
                days === d ? "bg-black text-white" : "border border-gray-300"
              }`}
            >
              {d === 1 ? "오늘" : `최근 ${d}일`}
            </Link>
          ))}
        </div>

        {!result.ready ? (
          <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-5">
            <h2 className="text-base font-bold text-amber-900">분석 저장소 준비 전</h2>
            <p className="mt-2 text-sm text-amber-900/90">
              {result.error === "schema_not_ready"
                ? "analytics migration이 아직 적용되지 않았습니다. 적용 후 이 화면에서 집계를 확인할 수 있습니다."
                : `집계를 불러오지 못했습니다: ${result.error}`}
            </p>
          </section>
        ) : (
          <>
            <p className="mt-4 text-sm font-medium text-gray-700">
              {formatPeriodLabel(days)} 기준
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="페이지뷰" value={result.summary.pageViews} />
              <Metric
                label="익명 방문 세션"
                value={result.summary.sessions}
                hint="24시간 단위 추정 기기·세션"
              />
              <Metric label="기사 상세 조회" value={result.summary.articleViews} />
              <Metric label="기사 클릭 합계" value={result.summary.articleClicks} />
              <Metric label="홈·목록 클릭" value={result.summary.homeArticleClicks} />
              <Metric label="관련 기사 클릭" value={result.summary.relatedArticleClicks} />
              <Metric label="검색 결과 클릭" value={result.summary.searchResultClicks} />
              <Metric label="검색 실행" value={result.summary.searchSubmits} />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="KO 이벤트" value={result.summary.koEvents} />
              <Metric label="EN 이벤트" value={result.summary.enEvents} />
              <Metric label="모바일 이벤트" value={result.summary.mobileEvents} />
              <Metric label="데스크톱 이벤트" value={result.summary.desktopEvents} />
            </div>

            <ArticleRankSection
              title="많이 본 기사"
              rows={result.summary.topViewedArticles}
              metricLabel="조회"
            />
            <ArticleRankSection
              title="많이 클릭한 기사"
              rows={result.summary.topClickedArticles}
              metricLabel="클릭"
            />

            <KeyRankSection
              title="인기 출처 (필터 클릭)"
              rows={result.summary.topSources.map((row) => ({
                label: getSourceLabel(row.key, null, "ko"),
                count: row.count,
              }))}
            />
            <KeyRankSection
              title="인기 카테고리 (필터 클릭)"
              rows={result.summary.topCategories.map((row) => ({
                label: getCategoryLabel(row.key, "ko"),
                count: row.count,
              }))}
            />

            <SearchRankSection rows={result.summary.topSearchQueries} />
            <ReferrerRankSection rows={result.summary.topReferrers} />
          </>
        )}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p> : null}
      <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

function ArticleRankSection({
  title,
  rows,
  metricLabel,
}: {
  title: string;
  rows: Array<{
    articleId: string;
    count: number;
    koTitle: string | null;
    enTitle: string | null;
    koSlug: string | null;
    enSlug: string | null;
    source: string | null;
  }>;
  metricLabel: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">데이터 없음</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((row, index) => {
            const href = articlePublicHref(row);
            const titleText = articleTitle(row, "ko");
            return (
              <div
                key={`${row.articleId}-${index}`}
                className="rounded-lg border border-gray-200 px-3 py-3 text-sm sm:px-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-400">
                      #{index + 1}
                      {row.source ? (
                        <span className="ml-2 text-gray-500">
                          {getSourceLabel(row.source, null, "ko")}
                        </span>
                      ) : null}
                    </p>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block font-semibold text-news-navy hover:underline"
                      >
                        {titleText}
                      </a>
                    ) : (
                      <p className="mt-1 font-semibold text-neutral-800">{titleText}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      KO: {row.koTitle ?? "—"} · EN: {row.enTitle ?? "—"}
                    </p>
                  </div>
                  <p className="shrink-0 font-bold text-gray-800">
                    {row.count.toLocaleString()} {metricLabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function KeyRankSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">데이터 없음</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <span className="font-medium">{row.label}</span>
              <span className="font-bold">{row.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SearchRankSection({
  rows,
}: {
  rows: Array<{ query: string; count: number }>;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">사이트 검색어 · 관심 이슈</h2>
      <p className="mt-1 text-xs text-gray-500">
        검색어 원문은 최대 80자·PII 마스킹 후 저장됩니다. 30일 이후 검색어 텍스트는
        운영 cleanup(`anonymize_analytics_search_queries`)으로 NULL 익명화되며,
        검색 실행 횟수 통계는 보존됩니다. 자동 schedule은 이번 PR에 포함되지 않습니다.
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">데이터 없음</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.query}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <span className="font-medium">{row.query}</span>
              <span className="font-bold">{row.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReferrerRankSection({
  rows,
}: {
  rows: Array<{ domain: string; count: number }>;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">외부 유입 도메인</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">데이터 없음</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.domain}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <span className="font-medium">{row.domain}</span>
              <span className="font-bold">{row.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
