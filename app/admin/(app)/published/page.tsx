export const dynamic = "force-dynamic";

import AdminListPager from "@/components/admin/AdminListPager";
import PublishedArticlesManager from "./PublishedArticlesManager";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import {
  fetchPublishedAdminList,
  parsePublishedAdminListQuery,
} from "@/lib/admin/fetchPublishedAdminList";
import { getCategoryLabel } from "@/lib/articleWorkflow";

function toDateKey(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "1970-01-01";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type PageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    date?: string;
    range?: string;
  }>;
};

export default async function AdminPublishedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = parsePublishedAdminListQuery(params);
  const { articles, totalCount, error, pageSize } =
    await fetchPublishedAdminList(query);

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 공개 기사
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl">
          공개 기사
        </h1>

        <p className="mt-3 text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base">
          DB에는 영구 보존됩니다. 목록은 기본 {pageSize}건씩 불러오며, 검색·날짜
          필터는 전체 공개 기사를 대상으로 조회합니다.
        </p>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mt-8">
            데이터를 불러오는 중 오류가 발생했습니다: {error}
          </div>
        ) : null}

        {!error ? (
          <PublishedArticlesManager
            articles={articles.map((article) => {
              const effectiveRaw = article.published_at || article.created_at;
              return {
                ...article,
                sourceLabel: getArticleSourceLabel({
                  source: article.source,
                  original_url: article.original_url,
                }),
                categoryLabel: getCategoryLabel(article.category),
                is_top_story: article.is_top_story === true,
                top_story_order:
                  typeof article.top_story_order === "number"
                    ? article.top_story_order
                    : 0,
                editorial_priority:
                  typeof article.editorial_priority === "string"
                    ? article.editorial_priority
                    : "normal",
                effectiveDate: toDateKey(effectiveRaw),
              };
            })}
            totalMatched={totalCount}
            page={query.page}
            pageSize={pageSize}
            initialQ={query.q}
            initialDate={query.date}
            initialRange={query.range}
          />
        ) : null}

        {!error && totalCount > 0 ? (
          <AdminListPager
            pathname="/admin/published"
            page={query.page}
            totalCount={totalCount}
            fetchedCount={articles.length}
            pageSize={pageSize}
            filterParams={{
              q: query.q || undefined,
              date: query.date || undefined,
              range: query.range !== "all" ? query.range : undefined,
            }}
          />
        ) : null}
      </section>
    </main>
  );
}
