"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { type ArticleLocale } from "@/lib/article/formatPublishedDate";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import {
  filterArticlesForSearch,
  filterHomePageSections,
  normalizeSearchQuery,
} from "@/lib/home/articleSearch";
import { truncateSummary } from "@/lib/home/formatHomeListDate";
import { getSourceLabel } from "@/lib/koreanArticleDisplay";
import HomeNewsSearch, {
  type HomeNewsSearchLabels,
} from "@/components/home/HomeNewsSearch";
import NewsThumbnail, {
  newsThumbFrameClass,
} from "@/components/home/NewsThumbnail";
import {
  newsMainGrid,
  newsPageShell,
  type NewsPageRole,
} from "@/lib/home/newsPageLayout";
import { resolveArticleHref } from "@/lib/home/resolveArticleHref";
import type { HomeArticleCard, HomePageSections } from "@/lib/home/types";
import { getBrandName } from "@/lib/brand";
import TrendingIssuesPanel from "./TrendingIssuesPanel";

export type HomeNewsLabels = {
  edition: string;
  tagline: string;
  navLatest: string;
  navCategories: string;
  navSources: string;
  alternateLang: string;
  featuredEyebrow: string;
  featuredTitle: string;
  readArticle: string;
  latestEyebrow: string;
  latestTitle: string;
  latestDesc: string;
  categoriesEyebrow: string;
  categoriesTitle: string;
  sourcesEyebrow: string;
  sourcesTitle: string;
  sourcesDesc: string;
  sourceLeadsTitle: string;
  sidebarEyebrow: string;
  sidebarTitle: string;
  sidebarDesc: string;
  navHome: string;
  empty: string;
  errorPrefix: string;
  noImage: string;
  columnEmpty: string;
  trendingTitle: string;
  trendingRegionUs: string;
  trendingRegionKr: string;
};

function formatCategoryCount(locale: ArticleLocale, n: number): string {
  if (locale === "ko") return `공개 ${n}건`;
  return `${n} published ${n === 1 ? "story" : "stories"}`;
}

type HomeNewsViewProps = {
  pageRole: NewsPageRole;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  sections: HomePageSections;
  articleHrefPrefix: string;
  /** When set (e.g. main hub /), overrides articleHrefPrefix per article. */
  articleHrefFor?: (article: HomeArticleCard) => string;
  homeHref: string;
  alternateLangHref: string;
  sourceFilterOptions?: string[];
  sourceFilterAllLabel?: string;
  errorMessage?: string | null;
  showDateInHeader?: boolean;
  headerDateText?: string;
  searchArticles?: HomeArticleCard[];
  searchPath?: string;
  searchLabels?: HomeNewsSearchLabels;
};

function listDateText(article: HomeArticleCard, locale: ArticleLocale): string {
  return locale === "ko"
    ? article.listDateKo ?? article.published_at ?? article.created_at
    : article.listDateEn ?? article.published_at ?? article.created_at;
}

function publishedFullText(
  article: HomeArticleCard,
  locale: ArticleLocale
): string | null {
  return locale === "ko"
    ? article.publishedFullKo ?? null
    : article.publishedFullEn ?? null;
}

function NavPill({
  href,
  children,
  variant = "default",
}: {
  href: string;
  children: ReactNode;
  variant?: "default" | "primary" | "ghost";
}) {
  const base =
    "inline-flex shrink-0 items-center justify-center rounded-md px-3 py-2 text-xs font-semibold whitespace-nowrap transition sm:text-sm";
  const styles =
    variant === "primary"
      ? `${base} bg-news-navy text-white hover:brightness-110`
      : variant === "ghost"
        ? `${base} text-neutral-500 hover:text-news-navy`
        : `${base} border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50`;

  if (href.startsWith("#")) {
    return (
      <a href={href} className={styles}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={styles}>
      {children}
    </Link>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-4 border-b border-neutral-200/80 pb-3 sm:mb-5 sm:pb-4">
      <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-news-red">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-[1.375rem] font-bold tracking-tight text-news-navy sm:text-[1.625rem]">
        {title}
      </h2>
      {description ? (
        <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-neutral-600 sm:text-base">
          {description}
        </p>
      ) : null}
    </header>
  );
}

function ArticleThumb({
  article,
  noImageLabel,
  priority = false,
  className = "",
  sizes = "100vw",
}: {
  article: HomeArticleCard;
  noImageLabel: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  return (
    <NewsThumbnail
      article={article}
      noImageLabel={noImageLabel}
      priority={priority}
      className={className}
      sizes={sizes}
    />
  );
}

function StoryMetaLine({
  article,
  locale,
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
}) {
  const displayLocale = article.locale ?? locale;
  const date = listDateText(article, displayLocale);

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium text-neutral-500 sm:text-sm">
      {article.locale ? (
        <>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
              article.locale === "ko"
                ? "bg-neutral-900 text-white"
                : "border border-neutral-300 bg-white text-neutral-700"
            }`}
          >
            {article.locale === "ko" ? "한국어" : "English"}
          </span>
          <span aria-hidden className="text-neutral-300">
            ·
          </span>
        </>
      ) : null}
      <span className="text-neutral-700">
        {getSourceLabel(article.source, article.original_url)}
      </span>
      <span aria-hidden className="text-neutral-300">
        ·
      </span>
      <span>{getCategoryLabel(article.category, displayLocale)}</span>
      <span aria-hidden className="text-neutral-300">
        ·
      </span>
      <time dateTime={article.published_at ?? article.created_at}>{date}</time>
    </p>
  );
}

function FeaturedHero({
  article,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
  splitLayout = false,
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
  splitLayout?: boolean;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);
  const published = publishedFullText(article, displayLocale);

  const body = (
    <>
      <StoryMetaLine article={article} locale={displayLocale} />

      <h2
        className={`mt-3 font-bold leading-[1.28] tracking-[-0.02em] text-news-navy ${
          splitLayout
            ? "text-[1.375rem] sm:text-[1.5rem] lg:text-[1.625rem]"
            : "text-[1.625rem] sm:text-2xl lg:text-[2.25rem]"
        }`}
      >
        <Link
          href={href}
          className="hover:text-news-red hover:underline decoration-neutral-300 underline-offset-4"
        >
          {article.title}
        </Link>
      </h2>

      {article.summary ? (
        <p
          className={`mt-4 text-neutral-700 ${
            splitLayout
              ? "line-clamp-2 text-[15px] leading-relaxed sm:text-base"
              : "max-w-3xl border-l-[3px] border-news-navy pl-4 text-[17px] font-medium leading-[1.65] sm:text-lg"
          }`}
        >
          {truncateSummary(article.summary, splitLayout ? 110 : 220, displayLocale)}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {published ? <p className="text-[15px] text-neutral-500">{published}</p> : null}
        <Link
          href={href}
          className="inline-flex items-center justify-center rounded-md bg-news-navy px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          {labels.readArticle}
        </Link>
      </div>
    </>
  );

  if (splitLayout) {
    return (
      <article className="overflow-hidden rounded-lg bg-white shadow-sm lg:grid lg:grid-cols-[1.05fr_minmax(0,0.95fr)] lg:items-stretch">
        <Link href={href} className="block bg-white lg:min-h-[220px]">
          <div
            className={`${newsThumbFrameClass} aspect-video w-full lg:aspect-[16/10] lg:h-full lg:min-h-[220px]`}
          >
            <ArticleThumb
              article={article}
              noImageLabel={labels.noImage}
              priority
              sizes="(max-width: 1024px) 100vw, 55vw"
            />
          </div>
        </Link>
        <div className="flex flex-col justify-center p-4 sm:p-5 lg:p-5">{body}</div>
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-lg bg-white shadow-sm">
      <Link href={href} className="block">
        <div
          className={`${newsThumbFrameClass} aspect-video w-full max-h-[560px]`}
        >
          <ArticleThumb
            article={article}
            noImageLabel={labels.noImage}
            priority
            sizes="(max-width: 1024px) 100vw, 70vw"
          />
        </div>
      </Link>
      <div className="p-5 sm:p-7 lg:p-8">{body}</div>
    </article>
  );
}

function TopStoriesColumnCard({
  article,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="border-b border-neutral-200 py-3.5 last:border-b-0 last:pb-0 sm:py-4">
      <div className="flex gap-3 sm:gap-4">
        <Link
          href={href}
          className="relative block w-28 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-neutral-200/80 sm:w-36"
        >
          <div className={`${newsThumbFrameClass} aspect-video w-full`}>
            <ArticleThumb
              article={article}
              noImageLabel={labels.noImage}
              sizes="(max-width: 640px) 112px, 144px"
            />
          </div>
        </Link>
        <div className="min-w-0 flex-1">
          <StoryMetaLine article={article} locale={displayLocale} />
          <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-neutral-950 sm:text-base">
            <Link href={href} className="line-clamp-3 hover:underline">
              {article.title}
            </Link>
          </h3>
          {article.summary ? (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-neutral-600 sm:text-[15px]">
              {truncateSummary(article.summary, 120, displayLocale)}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function FeaturedLeadCard({
  article,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
  priority = false,
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
  priority?: boolean;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-sm">
      <Link href={href} className="block bg-white">
        <div className={`${newsThumbFrameClass} aspect-video w-full max-h-[180px]`}>
          <ArticleThumb
            article={article}
            noImageLabel={labels.noImage}
            priority={priority}
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <StoryMetaLine article={article} locale={displayLocale} />
        <h2 className="mt-2 text-[17px] font-bold leading-snug tracking-[-0.01em] text-news-navy sm:text-xl">
          <Link
            href={href}
            className="line-clamp-3 hover:text-news-red hover:underline decoration-neutral-300 underline-offset-2"
          >
            {article.title}
          </Link>
        </h2>
        {article.summary ? (
          <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-neutral-600">
            {truncateSummary(article.summary, 100, displayLocale)}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function FeaturedRelatedItem({
  article,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
  index,
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
  index: number;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="border-b border-neutral-200 py-3.5 last:border-b-0 last:pb-0 sm:py-4">
      <div className="flex gap-3 sm:gap-4">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white">
          {index + 1}
        </span>
        <Link
          href={href}
          className="relative block w-24 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-neutral-200/80 sm:w-28"
        >
          <div className={`${newsThumbFrameClass} aspect-video w-full`}>
            <ArticleThumb
              article={article}
              noImageLabel={labels.noImage}
              sizes="(max-width: 640px) 96px, 112px"
            />
          </div>
        </Link>
        <div className="min-w-0 flex-1">
          <StoryMetaLine article={article} locale={displayLocale} />
          <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-neutral-950 sm:text-base">
            <Link href={href} className="line-clamp-2 hover:underline">
              {article.title}
            </Link>
          </h3>
        </div>
      </div>
    </article>
  );
}

function FeaturedWithRelated({
  leads,
  related,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  leads: HomeArticleCard[];
  related: HomeArticleCard[];
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {leads.map((article, index) => (
          <FeaturedLeadCard
            key={article.id}
            article={article}
            locale={locale}
            labels={labels}
            articleHrefPrefix={articleHrefPrefix}
            articleHrefFor={articleHrefFor}
            priority={index === 0}
          />
        ))}
      </div>
      {related.length > 0 ? (
        <aside className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm sm:px-3.5 sm:py-2.5">
          <h3 className="border-b border-neutral-200 pb-2 text-[15px] font-bold uppercase tracking-wide text-neutral-700">
            {labels.latestTitle}
          </h3>
          <div className="mt-1">
            {related.map((article, index) => (
              <FeaturedRelatedItem
                key={article.id}
                article={article}
                locale={locale}
                labels={labels}
                articleHrefPrefix={articleHrefPrefix}
                articleHrefFor={articleHrefFor}
                index={index}
              />
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function TopStoriesColumn({
  title,
  articles,
  emptyLabel,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
  accentClass,
}: {
  title: string;
  articles: HomeArticleCard[];
  emptyLabel: string;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
  accentClass: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm`}
    >
      <div className={`border-t-4 ${accentClass} px-4 py-3 sm:px-5`}>
        <h3 className="text-xl font-bold text-news-navy">{title}</h3>
      </div>
      <div className="flex-1 px-3 py-2 sm:px-4 sm:py-3">
        {articles.length === 0 ? (
          <p className="py-8 text-center text-[15px] text-neutral-500">{emptyLabel}</p>
        ) : (
          articles.map((article) => (
            <TopStoriesColumnCard
              key={article.id}
              article={article}
              locale={locale}
              labels={labels}
              articleHrefPrefix={articleHrefPrefix}
              articleHrefFor={articleHrefFor}
            />
          ))
        )}
      </div>
    </div>
  );
}

function LatestRow({
  article,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
  index,
  showRank = false,
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
  index: number;
  showRank?: boolean;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="group border-b border-neutral-200 py-4 first:pt-1 last:border-b-0 last:pb-1 sm:py-5">
      <div className="flex gap-4 sm:gap-5">
        <Link
          href={href}
          className="relative block w-32 shrink-0 overflow-hidden rounded-md bg-white sm:w-44"
        >
          <div className={`${newsThumbFrameClass} aspect-video w-full`}>
            <ArticleThumb
              article={article}
              noImageLabel={labels.noImage}
              sizes="(max-width: 640px) 128px, 176px"
            />
          </div>
          {showRank ? (
            <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded bg-news-navy text-[11px] font-bold text-white">
              {index + 1}
            </span>
          ) : null}
        </Link>

        <div className="min-w-0 flex-1 py-0.5">
          <StoryMetaLine article={article} locale={displayLocale} />
          <h3 className="mt-2 text-[1.1875rem] font-bold leading-snug text-neutral-950 sm:text-xl">
            <Link
              href={href}
              className="line-clamp-3 hover:underline decoration-neutral-300 underline-offset-2 [text-wrap:pretty]"
            >
              {article.title}
            </Link>
          </h3>
          <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-neutral-600">
            {truncateSummary(article.summary, 140, displayLocale)}
          </p>
        </div>
      </div>
    </article>
  );
}

function CategoryCard({
  article,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-neutral-200/90 bg-white">
      <Link href={href} className="block bg-white">
        <div className={`${newsThumbFrameClass} aspect-video w-full`}>
          <ArticleThumb
            article={article}
            noImageLabel={labels.noImage}
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 25vw"
          />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <StoryMetaLine article={article} locale={displayLocale} />
        <h3 className="mt-2.5 text-[17px] font-bold leading-snug text-neutral-950 sm:text-[1.1875rem]">
          <Link
            href={href}
            className="line-clamp-3 hover:underline decoration-neutral-300 underline-offset-2"
          >
            {article.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-3 flex-1 text-[15px] leading-relaxed text-neutral-600">
          {truncateSummary(article.summary, 120, displayLocale)}
        </p>
      </div>
    </article>
  );
}

function SidebarItem({
  article,
  locale,
  articleHrefPrefix,
  articleHrefFor,
  index,
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
  index: number;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="border-b border-neutral-200/80 pb-3.5 last:border-b-0 last:pb-0">
      <div className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
            {getSourceLabel(article.source, article.original_url)}
          </p>
          <h3 className="mt-1 text-[15px] font-semibold leading-snug text-neutral-900">
            <Link href={href} className="line-clamp-2 hover:underline">
              {article.title}
            </Link>
          </h3>
          <time
            dateTime={article.published_at ?? article.created_at}
            className="mt-1 block text-[13px] text-neutral-500"
          >
            {listDateText(article, displayLocale)}
          </time>
        </div>
      </div>
    </article>
  );
}

function SourceLeadMini({
  article,
  sourceLabel,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  article: HomeArticleCard;
  sourceLabel: string;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="flex gap-3 rounded-lg border border-neutral-200/80 bg-white p-3">
      <Link
        href={href}
        className="relative block w-20 shrink-0 overflow-hidden rounded-md bg-white"
      >
        <div className={`${newsThumbFrameClass} aspect-video w-full`}>
          <ArticleThumb
            article={article}
            noImageLabel={labels.noImage}
            sizes="80px"
          />
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        <span className="inline-flex rounded-md bg-neutral-900 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          {sourceLabel}
        </span>
        <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-neutral-950">
          <Link href={href} className="line-clamp-2 hover:underline">
            {article.title}
          </Link>
        </h3>
        <p className="mt-1 text-[13px] text-neutral-500">
          {listDateText(article, displayLocale)}
        </p>
      </div>
    </article>
  );
}

export default function HomeNewsView({
  pageRole,
  locale,
  labels,
  sections,
  articleHrefPrefix,
  articleHrefFor,
  homeHref,
  alternateLangHref,
  sourceFilterOptions = [],
  sourceFilterAllLabel = "All",
  errorMessage,
  showDateInHeader = false,
  headerDateText,
  searchArticles = [],
  searchPath,
  searchLabels,
}: HomeNewsViewProps) {
  const [selectedSourceLabel, setSelectedSourceLabel] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const handleSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);
  const normalizedSearch = normalizeSearchQuery(searchQuery);
  const displaySections = useMemo(
    () => filterHomePageSections(sections, searchQuery, locale),
    [sections, searchQuery, locale]
  );
  const searchResultCount = useMemo(
    () => filterArticlesForSearch(searchArticles, normalizedSearch, locale).length,
    [searchArticles, normalizedSearch, locale]
  );
  const showFeatured = Boolean(displaySections.featured);
  const topStories = displaySections.topStories;
  const showTopStories = Boolean(topStories);
  const featuredHub = useMemo(() => {
    if (
      displaySections.featuredLeads &&
      displaySections.featuredLeads.length > 0
    ) {
      return {
        leads: displaySections.featuredLeads,
        related: displaySections.featuredRelated ?? [],
      };
    }
    if (!displaySections.featured || !topStories) {
      return { leads: [] as HomeArticleCard[], related: [] as HomeArticleCard[] };
    }
    const featuredKey =
      displaySections.featured.article_id ?? displaySections.featured.id;
    const unique = new Map<string, HomeArticleCard>();
    for (const article of [...topStories.left, ...topStories.right]) {
      const key = article.article_id ?? article.id;
      if (key === featuredKey) continue;
      if (!unique.has(key)) unique.set(key, article);
    }
    const pool = Array.from(unique.values());
    const leads: HomeArticleCard[] = [displaySections.featured];
    if (pool[0]) leads.push(pool[0]);
    const leadKeys = new Set(leads.map((a) => a.article_id ?? a.id));
    const related = pool
      .filter((a) => !leadKeys.has(a.article_id ?? a.id))
      .slice(0, 5);
    return { leads, related };
  }, [
    displaySections.featured,
    displaySections.featuredLeads,
    displaySections.featuredRelated,
    topStories,
  ]);
  const useFeaturedComboLayout =
    showFeatured &&
    (featuredHub.leads.length >= 2 || featuredHub.related.length > 0);
  const showSidebar = displaySections.sidebar.length > 0;
  const trendingIssues = displaySections.trendingIssues;
  const showTrending = Boolean(
    trendingIssues &&
      (trendingIssues.us.length > 0 || trendingIssues.kr.length > 0)
  );
  const showAside = showTrending || showSidebar;
  const filteredSourceLeadCards = useMemo(() => {
    if (!selectedSourceLabel) return displaySections.sourceLeadCards;
    return displaySections.sourceLeadCards.filter(
      (item) => item.label === selectedSourceLabel
    );
  }, [displaySections.sourceLeadCards, selectedSourceLabel]);
  const filteredGroupedByCategory = useMemo(() => {
    if (!selectedSourceLabel) return displaySections.groupedByCategory;
    const out: Record<string, HomeArticleCard[]> = {};
    for (const [category, items] of Object.entries(
      displaySections.groupedByCategory
    )) {
      out[category] = items.filter(
        (article) =>
          getSourceLabel(article.source, article.original_url) === selectedSourceLabel
      );
    }
    return out;
  }, [displaySections.groupedByCategory, selectedSourceLabel]);
  const filteredVisibleCategories = useMemo(
    () =>
      displaySections.visibleCategories.filter(
        (category) => (filteredGroupedByCategory[category]?.length ?? 0) > 0
      ),
    [displaySections.visibleCategories, filteredGroupedByCategory]
  );
  const showCategories = filteredVisibleCategories.length > 0;
  const showSources =
    filteredSourceLeadCards.length > 0 || sourceFilterOptions.length > 0;
  const pageTitle = getBrandName(pageRole);

  const hasArticles =
    showFeatured ||
    showTopStories ||
    displaySections.latest.length > 0 ||
    displaySections.sidebar.length > 0 ||
    filteredVisibleCategories.length > 0;

  const headerDate = headerDateText ?? labels.edition;

  return (
    <main className="min-h-screen bg-[#f4f3ef] text-neutral-950">
      <header className="border-b-4 border-news-red bg-white">
        <div className={`${newsPageShell} py-5 sm:py-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-news-red">
                {showDateInHeader ? headerDate : labels.edition}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-news-navy sm:text-4xl">
                {pageTitle}
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-snug text-neutral-600 sm:text-sm sm:leading-relaxed lg:max-w-[34rem]">
                {labels.tagline}
              </p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-3 lg:w-auto lg:max-w-[min(100%,520px)] lg:items-end">
              {searchLabels && searchPath && searchArticles.length > 0 ? (
                <HomeNewsSearch
                  locale={locale}
                  searchPath={searchPath}
                  articleHrefPrefix={articleHrefPrefix}
                  articles={searchArticles}
                  labels={searchLabels}
                  onQueryChange={handleSearchQueryChange}
                />
              ) : null}
            <nav
              aria-label="Section navigation"
              className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-2 lg:justify-end [&::-webkit-scrollbar]:hidden"
            >
              {hasArticles ? (
                <>
                  {showFeatured ? (
                    <NavPill href="#featured">{labels.featuredTitle}</NavPill>
                  ) : null}
                  <NavPill href="#latest">{labels.navLatest}</NavPill>
                  {showSidebar ? (
                    <NavPill href="#sidebar">{labels.sidebarTitle}</NavPill>
                  ) : null}
                  <NavPill href="#sources">{labels.navSources}</NavPill>
                  <NavPill href="#categories">{labels.navCategories}</NavPill>
                </>
              ) : null}
              <NavPill href={homeHref}>{labels.navHome}</NavPill>
              <NavPill href={alternateLangHref} variant="primary">
                {labels.alternateLang}
              </NavPill>
            </nav>
            </div>
          </div>
        </div>
      </header>

      <div className={`${newsPageShell} py-8 sm:py-10 lg:py-12`}>
        {normalizedSearch ? (
          <p className="mb-6 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
            {locale === "ko" ? (
              <>
                검색어 <span className="font-semibold text-news-navy">“{searchQuery.trim()}”</span>
                {" · "}
                {searchResultCount}건 일치
              </>
            ) : (
              <>
                Results for{" "}
                <span className="font-semibold text-news-navy">“{searchQuery.trim()}”</span>
                {" · "}
                {searchResultCount} {searchResultCount === 1 ? "match" : "matches"}
              </>
            )}
          </p>
        ) : null}
        {errorMessage ? (
          <div
            className="mb-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {labels.errorPrefix} {errorMessage}
          </div>
        ) : null}

        {!errorMessage && !hasArticles ? (
          <p className="rounded-xl border border-neutral-200/90 bg-white py-14 text-center text-neutral-600">
            {labels.empty}
          </p>
        ) : null}

        {!errorMessage && hasArticles ? (
          <div className={showAside ? newsMainGrid : "min-w-0"}>
            <div className="min-w-0 space-y-10 lg:space-y-12">
              {showFeatured && displaySections.featured ? (
                <section id="featured" className="scroll-mt-6" aria-labelledby="home-featured">
                  <SectionHeading
                    eyebrow={labels.featuredEyebrow}
                    title={labels.featuredTitle}
                  />
                  {useFeaturedComboLayout ? (
                    <FeaturedWithRelated
                      leads={featuredHub.leads}
                      related={featuredHub.related}
                      locale={locale}
                      labels={labels}
                      articleHrefPrefix={articleHrefPrefix}
                      articleHrefFor={articleHrefFor}
                    />
                  ) : (
                    <FeaturedHero
                      article={displaySections.featured}
                      locale={locale}
                      labels={labels}
                      articleHrefPrefix={articleHrefPrefix}
                      articleHrefFor={articleHrefFor}
                    />
                  )}
                </section>
              ) : null}

              {showTopStories && topStories ? (
                <section id="latest" className="scroll-mt-6">
                  <SectionHeading
                    eyebrow={labels.latestEyebrow}
                    title={labels.latestTitle}
                    description={labels.latestDesc}
                  />
                  <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
                    <TopStoriesColumn
                      title={topStories.leftTitle}
                      articles={topStories.left}
                      emptyLabel={labels.columnEmpty}
                      locale={locale}
                      labels={labels}
                      articleHrefPrefix={articleHrefPrefix}
                      articleHrefFor={articleHrefFor}
                      accentClass={
                        pageRole === "ko" ? "border-news-red" : "border-blue-800"
                      }
                    />
                    <TopStoriesColumn
                      title={topStories.rightTitle}
                      articles={topStories.right}
                      emptyLabel={labels.columnEmpty}
                      locale={locale}
                      labels={labels}
                      articleHrefPrefix={articleHrefPrefix}
                      articleHrefFor={articleHrefFor}
                      accentClass={
                        pageRole === "ko" ? "border-blue-800" : "border-news-red"
                      }
                    />
                  </div>
                </section>
              ) : null}

              {!showTopStories && displaySections.latest.length > 0 ? (
                <section id="latest" className="scroll-mt-6">
                  <SectionHeading
                    eyebrow={labels.latestEyebrow}
                    title={labels.latestTitle}
                    description={labels.latestDesc}
                  />
                  <div className="rounded-lg border border-neutral-200 bg-white px-4 py-1 sm:px-6 sm:py-2">
                    {displaySections.latest.map((article, index) => (
                      <LatestRow
                        key={article.id}
                        article={article}
                        locale={locale}
                        labels={labels}
                        articleHrefPrefix={articleHrefPrefix}
                        articleHrefFor={articleHrefFor}
                        index={index}
                        showRank
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {showSources ? (
                <section id="sources" className="scroll-mt-6">
                  <SectionHeading
                    eyebrow={labels.sourcesEyebrow}
                    title={labels.sourcesTitle}
                    description={labels.sourcesDesc}
                  />

                  <div className="mb-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSourceLabel(null)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        selectedSourceLabel
                          ? "border border-neutral-200 bg-white text-neutral-600"
                          : "bg-neutral-900 text-white"
                      }`}
                    >
                      {sourceFilterAllLabel}
                    </button>
                    {sourceFilterOptions.map((label) => {
                      const hasSource =
                        displaySections.activeSourceLabels.includes(label);
                      const selected = selectedSourceLabel === label;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setSelectedSourceLabel(label)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            selected
                              ? "bg-neutral-900 text-white"
                              : hasSource
                                ? "border border-neutral-200 bg-white text-neutral-700"
                                : "border border-neutral-200 bg-white text-neutral-400"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <h3 className="mb-4 text-[17px] font-bold text-news-navy">
                    {labels.sourceLeadsTitle}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredSourceLeadCards.map((item) => (
                      <SourceLeadMini
                        key={item.key}
                        article={item.article}
                        sourceLabel={item.label}
                        locale={locale}
                        labels={labels}
                        articleHrefPrefix={articleHrefPrefix}
                        articleHrefFor={articleHrefFor}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {showCategories ? (
                <section id="categories" className="scroll-mt-6">
                  <SectionHeading
                    eyebrow={labels.categoriesEyebrow}
                    title={labels.categoriesTitle}
                  />
                  <div className="space-y-10">
                    {filteredVisibleCategories.map((category) => {
                      const items = filteredGroupedByCategory[category].slice(
                        0,
                        3
                      );
                      const total =
                        filteredGroupedByCategory[category].length;

                      return (
                        <div key={category}>
                          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-news-red/70 pb-2">
                            <h3 className="text-xl font-bold text-news-navy">
                              {getCategoryLabel(category, locale)}
                            </h3>
                            <span className="text-sm text-neutral-500">
                              {formatCategoryCount(locale, total)}
                            </span>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-5">
                            {items.map((article) => (
                              <CategoryCard
                                key={article.id}
                                article={article}
                                locale={locale}
                                labels={labels}
                                articleHrefPrefix={articleHrefPrefix}
                                articleHrefFor={articleHrefFor}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>

            {showAside ? (
              <aside
                className="scroll-mt-6 space-y-5 lg:sticky lg:top-6 lg:self-start"
              >
                {showTrending && trendingIssues ? (
                  <TrendingIssuesPanel
                    block={trendingIssues}
                    labels={{
                      title: labels.trendingTitle,
                      regionUs: labels.trendingRegionUs,
                      regionKr: labels.trendingRegionKr,
                    }}
                  />
                ) : null}

                {showSidebar ? (
                <section
                  id="sidebar"
                  className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    {labels.sidebarEyebrow}
                  </p>
                  <h2 className="mt-1 text-[17px] font-bold text-neutral-950">
                    {labels.sidebarTitle}
                  </h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">
                    {labels.sidebarDesc}
                  </p>
                  <div className="mt-4 space-y-1">
                    {displaySections.sidebar.map((article, index) => (
                      <SidebarItem
                        key={article.id}
                        article={article}
                        locale={locale}
                        articleHrefPrefix={articleHrefPrefix}
                        articleHrefFor={articleHrefFor}
                        index={index}
                      />
                    ))}
                  </div>
                </section>
                ) : null}
              </aside>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
