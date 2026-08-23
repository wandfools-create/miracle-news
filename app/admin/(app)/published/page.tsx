export const dynamic = "force-dynamic";

import PublishedArticlesManager from "./PublishedArticlesManager";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import { supabase } from "../../../../lib/supabase";
import { getCategoryLabel } from "../../../../lib/articleWorkflow";

function toDateKey(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "1970-01-01";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function AdminPublishedPage() {
  const baseSelect = `
      id,
      source,
      original_url,
      title_original,
      title_translated,
      title_ko,
      summary_original,
      summary_translated,
      summary_ko,
      category,
      status,
      review_status,
      thumbnail_url,
      published_at,
      created_at,
      is_published
    `;

  const withTopStory = await supabase
    .from("articles")
    .select(
      `
      ${baseSelect},
      is_top_story,
      top_story_order,
      editorial_priority
    `
    )
    .eq("is_published", true)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  let articles = withTopStory.data;
  let error = withTopStory.error;
  if (withTopStory.error) {
    const fallback = await supabase
      .from("articles")
      .select(baseSelect)
      .eq("is_published", true)
      .eq("status", "published")
      .order("published_at", { ascending: false });
    error = fallback.error;
    articles = (fallback.data ?? []).map((row) => ({
      ...row,
      is_top_story: false,
      top_story_order: 0,
      editorial_priority: "normal",
    }));
  }

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
          현재 사이트에 공개된 기사 목록입니다.
        </p>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mt-8">
            데이터를 불러오는 중 오류가 발생했습니다: {error.message}
          </div>
        ) : null}

        {!error && (!articles || articles.length === 0) ? (
          <div className="mt-6 rounded-2xl border p-5 text-sm text-gray-600 sm:mt-8 sm:p-6 sm:text-base">
            현재 공개된 기사가 없습니다.
          </div>
        ) : null}

        {!error && articles && articles.length > 0 ? (
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
          />
        ) : null}
      </section>
    </main>
  );
}