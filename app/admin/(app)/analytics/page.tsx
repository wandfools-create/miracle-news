import Link from "next/link";
import { fetchAnalyticsSummary } from "@/lib/analytics/recordAnalyticsEvent";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ days?: string }>;
};

export default async function AnalyticsAdminPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const daysRaw = Number(params.days ?? 7);
  const days = daysRaw === 1 || daysRaw === 30 ? daysRaw : 7;
  const { summary, error } = await fetchAnalyticsSummary(days);

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-black sm:px-6">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-semibold text-gray-500">관리자 / 분석</p>
        <h1 className="mt-2 text-2xl font-bold">방문자 분석</h1>
        <p className="mt-2 text-sm text-gray-600">
          IP·전체 user-agent·PII 없이 집계합니다. 검색어는 해시만 저장합니다.
        </p>

        <div className="mt-4 flex gap-2 text-sm">
          {[1, 7, 30].map((d) => (
            <Link
              key={d}
              href={`/admin/analytics?days=${d}`}
              className={`rounded-full px-3 py-1 font-semibold ${
                days === d ? "bg-black text-white" : "border border-gray-300"
              }`}
            >
              {d === 1 ? "오늘" : `${d}일`}
            </Link>
          ))}
        </div>

        {error ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            집계 불가 (migration 미적용 가능): {error}
          </p>
        ) : null}

        {summary ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Metric label="방문 세션" value={summary.sessions} />
            <Metric label="Page views" value={summary.pageViews} />
            <Metric label="기사 조회" value={summary.articleViews} />
            <Metric label="기사 클릭" value={summary.articleClicks} />
            <Metric label="KO 이벤트" value={summary.koEvents} />
            <Metric label="EN 이벤트" value={summary.enEvents} />
          </div>
        ) : null}

        {summary && summary.topArticles.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-bold">인기 기사</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {summary.topArticles.map((row) => (
                <li key={row.articleId}>
                  {row.articleId.slice(0, 8)}… — {row.views} views
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {summary && summary.topReferrers.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-bold">유입 domain</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {summary.topReferrers.map((row) => (
                <li key={row.domain}>
                  {row.domain} — {row.count}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
