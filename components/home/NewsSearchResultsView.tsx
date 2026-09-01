import Link from "next/link";
import AnalyticsTrackedLink from "@/components/analytics/AnalyticsTrackedLink";
import { AnalyticsSearchSubmit } from "@/components/analytics/AnalyticsSearchSubmit";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import { newsPageShell } from "@/lib/home/newsPageLayout";
import { resolveArticleHref } from "@/lib/home/resolveArticleHref";
import { getSourceLabel } from "@/lib/koreanArticleDisplay";
import type { HomeArticleCard } from "@/lib/home/types";

export type NewsSearchResultsLabels = {
  title: string;
  homeLink: string;
  alternateLang: string;
  placeholder: string;
  empty: string;
  emptyHint: string;
};

function formatResultsFor(locale: ArticleLocale, query: string): string {
  if (locale === "ko") return `“${query}” 검색 결과`;
  return `Results for “${query}”`;
}

function formatResultCount(locale: ArticleLocale, count: number): string {
  if (locale === "ko") return `${count}건`;
  return `${count} ${count === 1 ? "story" : "stories"}`;
}

type NewsSearchResultsViewProps = {
  locale: ArticleLocale;
  query: string;
  results: HomeArticleCard[];
  labels: NewsSearchResultsLabels;
  homeHref: string;
  alternateLangHref: string;
  articleHrefPrefix: string;
  searchPath: string;
};

function SearchResultCard({
  article,
  locale,
  articleHrefPrefix,
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  articleHrefPrefix: string;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix);
  const date =
    displayLocale === "ko"
      ? article.listDateKo ?? article.published_at ?? article.created_at
      : article.listDateEn ?? article.published_at ?? article.created_at;

  return (
    <article className="border-b border-neutral-200 py-4 last:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {getSourceLabel(article.source, article.original_url)}
        <span aria-hidden className="mx-1.5 text-neutral-300">
          ·
        </span>
        {getCategoryLabel(article.category, displayLocale)}
        <span aria-hidden className="mx-1.5 text-neutral-300">
          ·
        </span>
        <time dateTime={article.published_at ?? article.created_at}>{date}</time>
      </p>
      <h2 className="mt-2 text-lg font-bold leading-snug text-news-navy">
        <AnalyticsTrackedLink
          href={href}
          className="hover:text-news-red hover:underline"
          eventName="search_result_click"
          locale={locale}
          articleId={article.article_id ?? article.id}
        >
          {article.title}
        </AnalyticsTrackedLink>
      </h2>
      {article.summary ? (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-600">
          {article.summary}
        </p>
      ) : null}
    </article>
  );
}

export default function NewsSearchResultsView({
  locale,
  query,
  results,
  labels,
  homeHref,
  alternateLangHref,
  articleHrefPrefix,
  searchPath,
}: NewsSearchResultsViewProps) {
  const trimmed = query.trim();

  return (
    <main className="min-h-screen bg-[#f4f3ef] text-neutral-950">
      <AnalyticsSearchSubmit locale={locale} query={trimmed} />
      <header className="border-b-4 border-news-red bg-white">
        <div className={`${newsPageShell} py-5 sm:py-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-news-red">
                Search
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-news-navy sm:text-3xl">
                {labels.title}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={homeHref}
                className="inline-flex items-center rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 sm:text-sm"
              >
                {labels.homeLink}
              </Link>
              <AnalyticsTrackedLink
                href={alternateLangHref}
                className="inline-flex items-center rounded-md bg-news-navy px-3 py-2 text-xs font-semibold text-white hover:brightness-110 sm:text-sm"
                eventName="language_switch"
                locale={locale}
              >
                {labels.alternateLang}
              </AnalyticsTrackedLink>
            </div>
          </div>
          <form action={searchPath} method="get" className="mt-4 max-w-xl">
            <input
              type="search"
              name="q"
              defaultValue={trimmed}
              placeholder={labels.placeholder}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-news-navy focus:outline-none focus:ring-2 focus:ring-news-navy/15"
            />
          </form>
        </div>
      </header>

      <div className={`${newsPageShell} py-8 sm:py-10`}>
        {trimmed ? (
          <p className="text-sm font-semibold text-neutral-700">
            {formatResultsFor(locale, trimmed)}
            <span className="ml-2 font-normal text-neutral-500">
              {formatResultCount(locale, results.length)}
            </span>
          </p>
        ) : null}

        {trimmed && results.length > 0 ? (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-white px-4 py-2 sm:px-6">
            {results.map((article) => (
              <SearchResultCard
                key={article.id}
                article={article}
                locale={locale}
                articleHrefPrefix={articleHrefPrefix}
              />
            ))}
          </div>
        ) : null}

        {trimmed && results.length === 0 ? (
          <div className="mt-6 rounded-lg border border-neutral-200 bg-white px-6 py-12 text-center">
            <p className="text-base font-semibold text-neutral-800">{labels.empty}</p>
            <p className="mt-2 text-sm text-neutral-500">{labels.emptyHint}</p>
          </div>
        ) : null}

        {!trimmed ? (
          <p className="mt-4 text-sm text-neutral-500">{labels.emptyHint}</p>
        ) : null}
      </div>
    </main>
  );
}
