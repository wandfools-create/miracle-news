"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import {
  filterArticlesForSearch,
  normalizeSearchQuery,
} from "@/lib/home/articleSearch";
import { resolveArticleHref } from "@/lib/home/resolveArticleHref";
import { getSourceLabel } from "@/lib/koreanArticleDisplay";
import type { HomeArticleCard } from "@/lib/home/types";
import { trackAnalyticsEvent } from "@/components/analytics/AnalyticsPageView";

export type HomeNewsSearchLabels = {
  placeholder: string;
  ariaLabel: string;
  openSearch: string;
  closeSearch: string;
  noResults: string;
  /** Shown when preview has no matches but user can open full search page. */
  viewAllResultsEmpty: string;
};

function formatViewAllResults(
  locale: ArticleLocale,
  count: number,
  labels: HomeNewsSearchLabels
): string {
  if (count <= 0) return labels.viewAllResultsEmpty;
  if (locale === "ko") return `전체 검색 결과 보기 (${count}건)`;
  return `View all results (${count})`;
}

type HomeNewsSearchProps = {
  locale: ArticleLocale;
  searchPath: string;
  articleHrefPrefix: string;
  articles: HomeArticleCard[];
  labels: HomeNewsSearchLabels;
  onQueryChange: (query: string) => void;
};

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M13 13l4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}

function SearchResultRow({
  article,
  locale,
  articleHrefPrefix,
  onPick,
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  articleHrefPrefix: string;
  onPick: () => void;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix);

  return (
    <li>
      <Link
        href={href}
        onClick={() => {
          onPick();
          const articleId = article.article_id ?? article.id;
          if (articleId) {
            trackAnalyticsEvent({
              eventName: "search_result_click",
              locale,
              articleId,
            });
          }
        }}
        className="block px-3 py-2.5 hover:bg-neutral-50"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          {getSourceLabel(article.source, article.original_url)}
          <span aria-hidden className="mx-1.5 text-neutral-300">
            ·
          </span>
          {getCategoryLabel(article.category, displayLocale)}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-news-navy">
          {article.title}
        </p>
      </Link>
    </li>
  );
}

export default function HomeNewsSearch({
  locale,
  searchPath,
  articleHrefPrefix,
  articles,
  labels,
  onQueryChange,
}: HomeNewsSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const normalized = normalizeSearchQuery(query);
  const previewResults = useMemo(
    () => filterArticlesForSearch(articles, normalized, locale).slice(0, 8),
    [articles, normalized, locale]
  );

  useEffect(() => {
    onQueryChange(query);
  }, [query, onQueryChange]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const navigateToSearchPage = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`${searchPath}?q=${encodeURIComponent(trimmed)}`);
    setPanelOpen(false);
    setMobileOpen(false);
  };

  const showPanel = panelOpen && normalized.length > 0;
  const fieldVisible = mobileOpen;

  const searchField = (
    <div className="relative w-full lg:w-[min(100%,280px)]">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPanelOpen(true);
        }}
        onFocus={() => setPanelOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            navigateToSearchPage();
          }
          if (event.key === "Escape") {
            setPanelOpen(false);
            setMobileOpen(false);
          }
        }}
        placeholder={labels.placeholder}
        aria-label={labels.ariaLabel}
        className="w-full rounded-md border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-news-navy focus:outline-none focus:ring-2 focus:ring-news-navy/15"
      />
      {showPanel ? (
        <div className="absolute right-0 z-50 mt-1.5 w-full min-w-[280px] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg sm:min-w-[320px]">
          {previewResults.length > 0 ? (
            <ul className="max-h-80 divide-y divide-neutral-100 overflow-y-auto">
              {previewResults.map((article) => (
                <SearchResultRow
                  key={article.id}
                  article={article}
                  locale={locale}
                  articleHrefPrefix={articleHrefPrefix}
                  onPick={() => {
                    setPanelOpen(false);
                    setMobileOpen(false);
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-neutral-500">{labels.noResults}</p>
          )}
          <button
            type="button"
            onClick={navigateToSearchPage}
            className="w-full border-t border-neutral-200 bg-neutral-50 px-3 py-2.5 text-left text-xs font-semibold text-news-navy hover:bg-neutral-100"
          >
            {formatViewAllResults(locale, previewResults.length, labels)}
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div ref={rootRef} className="w-full lg:w-auto">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-news-navy lg:hidden"
          aria-label={mobileOpen ? labels.closeSearch : labels.openSearch}
          aria-expanded={mobileOpen}
        >
          <SearchIcon className="h-4 w-4" />
        </button>
        <div
          className={`${fieldVisible ? "block w-full" : "hidden"} lg:block lg:w-auto`}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              navigateToSearchPage();
            }}
          >
            {searchField}
          </form>
        </div>
      </div>
    </div>
  );
}
