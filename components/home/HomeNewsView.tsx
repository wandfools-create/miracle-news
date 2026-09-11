"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  newsThumbFrameForVariant,
  type NewsThumbVariant,
} from "@/components/home/NewsThumbnail";
import {
  newsHomeThreeColGrid,
  newsPageShell,
  type NewsPageRole,
} from "@/lib/home/newsPageLayout";
import { resolveArticleHref } from "@/lib/home/resolveArticleHref";
import {
  buildHomeCategoryFilterHref,
  parseHomeCategoryFilter,
  parseHomeSourceFilter,
} from "@/lib/home/buildHomeFilterHref";
import { buildHomeFilterResults } from "@/lib/home/homeFilterResults";
import {
  centerBandGridColClass,
  centerBandGridRowClass,
  homeFeaturedCenterColClass,
  homeLeftRailColClass,
  homeRightRailColClass,
  isGlobalHomeFilterMode,
  shouldShowLatestFallbackSection,
  shouldShowTopStoriesBand,
  shouldUseNewspaperThreeColGrid,
} from "@/lib/home/homeCenterLayoutPolicy";
import {
  displaySourceTabLabel,
  featuredConfigsForGroup,
  filterSourceLeadCardsByGroup,
  homeSectionTabClass,
  homePillButtonClass,
  homeSourceGroupButtonLabels,
  type HomeSourceGroup,
} from "@/lib/home/homeSourceGroupFilter";
import { normalizeSource } from "@/lib/article/normalizeSource";
import type { HomeArticleCard, HomePageSections, TodayEditionMeta } from "@/lib/home/types";
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
  trendingRelatedLabel: string;
  trendingOriginalLabel: string;
  categoriesEmpty: string;
  previousHighlightsTitle: string;
  previousHighlightsDesc: string;
  editionHeaderTodayLabel: string;
  continuingIssueLabel: string;
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

function TodayEditionHeader({
  meta,
  locale,
}: {
  meta: TodayEditionMeta;
  locale: ArticleLocale;
}) {
  const dateText = locale === "ko" ? meta.headerDateKo : meta.headerDateEn;
  const title = locale === "ko" ? meta.editionTitleKo : meta.editionTitleEn;
  const statusLine = locale === "ko" ? meta.statusLineKo : meta.statusLineEn;
  const preparingPhase =
    locale === "ko" ? meta.preparingPhaseKo : meta.preparingPhaseEn;

  return (
    <header className="order-0 mb-6 min-w-0 border-b border-neutral-300 pb-4 xl:col-span-full xl:mb-8">
      <p className="text-[13px] font-medium text-neutral-600 sm:text-sm">
        {dateText}
      </p>
      <h2 className="mt-1 text-lg font-bold tracking-tight text-news-navy sm:text-xl">
        {title}
      </h2>
      <p className="mt-1 text-[13px] text-neutral-600 sm:text-sm">{statusLine}</p>
      {meta.status === "preparing" || meta.status === "carryover" ? (
        <p className="mt-1 text-[12px] font-medium text-neutral-500">
          {preparingPhase}
        </p>
      ) : null}
    </header>
  );
}

function TodayEditionPreparing({
  meta,
  locale,
}: {
  meta: TodayEditionMeta;
  locale: ArticleLocale;
}) {
  const message =
    locale === "ko" ? meta.preparingMessageKo : meta.preparingMessageEn;
  const lines = message.split("\n");

  return (
    <div
      className="border border-neutral-200 bg-white px-4 py-8 text-center sm:px-6 sm:py-10"
      role="status"
    >
      <p className="text-[15px] font-semibold text-news-navy sm:text-base">
        {lines[0]}
      </p>
      {lines[1] ? (
        <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
          {lines[1]}
        </p>
      ) : null}
    </div>
  );
}

function PreviousHighlightsSection({
  articles,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  articles: HomeArticleCard[];
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  if (articles.length === 0) return null;

  return (
    <section
      id="previous-highlights"
      className="order-4 min-w-0 scroll-mt-6 border-t border-neutral-300 pt-8 xl:order-none xl:col-span-full xl:row-start-3"
    >
      <SectionHeading
        title={labels.previousHighlightsTitle}
        description={labels.previousHighlightsDesc}
        eyebrow=""
      />
      <div>
        {articles.map((article) => (
          <StoryListRow
            key={article.id}
            article={article}
            locale={locale}
            labels={labels}
            articleHrefPrefix={articleHrefPrefix}
            articleHrefFor={articleHrefFor}
            summaryLen={100}
          />
        ))}
      </div>
    </section>
  );
}

function PreviousHighlightsRail({
  articles,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  articles: HomeArticleCard[];
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  if (articles.length === 0) return null;

  return (
    <section
      id="previous-highlights"
      className="min-w-0 scroll-mt-6 border-t border-neutral-300 pt-3"
    >
      <h2 className="border-b border-neutral-200 pb-2 text-[15px] font-bold text-news-navy">
        {labels.previousHighlightsTitle}
      </h2>
      <div className="mt-1">
        {articles.map((article, index) => (
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
  );
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
    "inline-flex shrink-0 items-center justify-center px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition sm:text-sm";
  const styles =
    variant === "primary"
      ? `${base} bg-news-navy text-white hover:brightness-110`
      : variant === "ghost"
        ? `${base} text-neutral-500 hover:text-news-navy`
        : `${base} text-neutral-700 hover:text-news-navy`;

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
  showEyebrow = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  /** English/eyebrow labels are quiet — only show when explicitly useful. */
  showEyebrow?: boolean;
}) {
  return (
    <header className="mb-4 border-b border-neutral-300 pb-2.5 sm:mb-5">
      {showEyebrow ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={`font-bold tracking-tight text-news-navy ${
          showEyebrow ? "mt-1 text-xl sm:text-[1.375rem]" : "text-xl sm:text-[1.375rem]"
        }`}
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-1.5 text-[14px] leading-relaxed text-neutral-600 sm:text-[15px]">
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
  objectFit = "contain",
  variant,
}: {
  article: HomeArticleCard;
  noImageLabel: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
  objectFit?: "contain" | "cover";
  variant?: NewsThumbVariant;
}) {
  return (
    <NewsThumbnail
      article={article}
      noImageLabel={noImageLabel}
      priority={priority}
      className={className}
      sizes={sizes}
      objectFit={objectFit}
      variant={variant}
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
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-medium text-neutral-500 sm:text-[13px]">
      {article.locale ? (
        <>
          <span className="font-semibold uppercase tracking-wide text-neutral-700">
            {article.locale === "ko" ? "KO" : "EN"}
          </span>
          <span aria-hidden className="text-neutral-300">
            ·
          </span>
        </>
      ) : null}
      <span className="text-neutral-700">
        {getSourceLabel(article.source, article.original_url, locale)}
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
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);
  const published = publishedFullText(article, displayLocale);

  return (
    <article className="border-b border-neutral-300 pb-6">
      <Link href={href} className="block">
        <div className={`${newsThumbFrameClass} aspect-[16/10] w-full`}>
          <ArticleThumb
            article={article}
            noImageLabel={labels.noImage}
            priority
            objectFit="cover"
            sizes="(max-width: 1024px) 100vw, 55vw"
          />
        </div>
      </Link>
      <div className="pt-4">
        <StoryMetaLine article={article} locale={displayLocale} />
        <h2 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-[-0.02em] text-news-navy sm:text-[1.75rem] lg:text-[2rem]">
          <Link
            href={href}
            className="hover:text-news-red hover:underline decoration-neutral-300 underline-offset-4"
          >
            {article.title}
          </Link>
        </h2>
        {article.summary ? (
          <p className="mt-3 border-l-2 border-news-navy pl-3 text-[15px] font-medium leading-relaxed text-neutral-700 sm:text-[16px] sm:leading-[1.65]">
            {truncateSummary(article.summary, 220, displayLocale)}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {published ? (
            <p className="text-[13px] text-neutral-500">{published}</p>
          ) : null}
          <Link
            href={href}
            className="text-[13px] font-semibold text-news-navy underline-offset-2 hover:underline"
          >
            {labels.readArticle}
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Horizontal story row — image + title + short dek + time (no outer card). */
function StoryListRow({
  article,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
  summaryLen = 110,
  titleClamp = 2,
  thumbClass = "relative block h-[72px] w-[112px] shrink-0 overflow-hidden bg-neutral-100 sm:h-[88px] sm:w-[140px]",
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
  summaryLen?: number;
  titleClamp?: 2 | 3;
  thumbClass?: string;
}) {
  const displayLocale = article.locale ?? locale;
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="border-b border-neutral-200 py-3.5 last:border-b-0 sm:py-4">
      <div className="flex gap-3 sm:gap-4">
        <Link href={href} className={thumbClass}>
          <div className={`${newsThumbFrameClass} h-full w-full aspect-[16/10]`}>
            <ArticleThumb
              article={article}
              noImageLabel={labels.noImage}
              objectFit="cover"
              sizes="(max-width: 640px) 112px, 140px"
            />
          </div>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            {getSourceLabel(article.source, article.original_url, locale)}
            <span className="mx-1.5 font-normal text-neutral-300">·</span>
            <time
              dateTime={article.published_at ?? article.created_at}
              className="font-normal normal-case tracking-normal text-neutral-500"
            >
              {listDateText(article, displayLocale)}
            </time>
          </p>
          <h3 className="mt-1 text-[15px] font-bold leading-snug text-neutral-950 sm:text-[16px]">
            <Link
              href={href}
              className={`${titleClamp === 3 ? "line-clamp-3" : "line-clamp-2"} hover:underline`}
            >
              {article.title}
            </Link>
          </h3>
          {article.summary ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-neutral-600">
              {truncateSummary(article.summary, summaryLen, displayLocale)}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function FeaturedSecondary({
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
    <article className="border-b border-neutral-200 pb-4 sm:border-b-0 sm:border-l sm:border-neutral-200 sm:pb-0 sm:pl-5">
      <Link href={href} className="block">
        <div className={`${newsThumbFrameClass} aspect-[16/10] w-full`}>
          <ArticleThumb
            article={article}
            noImageLabel={labels.noImage}
            objectFit="cover"
            sizes="(max-width: 640px) 100vw, 30vw"
          />
        </div>
      </Link>
      <div className="pt-3">
        <StoryMetaLine article={article} locale={displayLocale} />
        <h3 className="mt-1.5 text-[17px] font-bold leading-snug tracking-[-0.01em] text-news-navy sm:text-lg">
          <Link
            href={href}
            className="line-clamp-3 hover:text-news-red hover:underline decoration-neutral-300 underline-offset-2"
          >
            {article.title}
          </Link>
        </h3>
        {article.summary ? (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-neutral-600">
            {truncateSummary(article.summary, 90, displayLocale)}
          </p>
        ) : null}
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
  const primary = leads[0];
  const secondary = leads[1];

  return (
    <div className="space-y-5">
      {primary ? (
        <div
          className={
            secondary
              ? "grid gap-5 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)] sm:gap-0 sm:items-start"
              : "max-w-3xl"
          }
        >
          <FeaturedHero
            article={primary}
            locale={locale}
            labels={labels}
            articleHrefPrefix={articleHrefPrefix}
            articleHrefFor={articleHrefFor}
          />
          {secondary ? (
            <FeaturedSecondary
              article={secondary}
              locale={locale}
              labels={labels}
              articleHrefPrefix={articleHrefPrefix}
              articleHrefFor={articleHrefFor}
            />
          ) : null}
        </div>
      ) : null}

      {related.length > 0 ? (
        <div>
          <h3 className="border-b border-neutral-300 pb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-neutral-500">
            {labels.latestTitle}
          </h3>
          <div>
            {related.map((article) => (
              <StoryListRow
                key={article.id}
                article={article}
                locale={locale}
                labels={labels}
                articleHrefPrefix={articleHrefPrefix}
                articleHrefFor={articleHrefFor}
                summaryLen={90}
              />
            ))}
          </div>
        </div>
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
    <div className="min-w-0">
      <div className={`border-b border-neutral-300 border-t-2 ${accentClass} pb-2 pt-1`}>
        <h3 className="text-[15px] font-bold text-news-navy sm:text-base">{title}</h3>
      </div>
      <div>
        {articles.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-neutral-500">{emptyLabel}</p>
        ) : (
          articles.map((article) => (
            <StoryListRow
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
}: {
  article: HomeArticleCard;
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
  index?: number;
  showRank?: boolean;
}) {
  return (
    <StoryListRow
      article={article}
      locale={locale}
      labels={labels}
      articleHrefPrefix={articleHrefPrefix}
      articleHrefFor={articleHrefFor}
      summaryLen={140}
      titleClamp={3}
      thumbClass="relative block h-[80px] w-[128px] shrink-0 overflow-hidden bg-neutral-100 sm:h-[100px] sm:w-[160px]"
    />
  );
}

function CategoryLead({
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
    <article className="min-w-0 border-b border-neutral-200 pb-5 sm:border-b-0 sm:pb-0 sm:pr-6 lg:border-r lg:border-neutral-200">
      <Link href={href} className="block">
        <div className={newsThumbFrameForVariant("categoryCard")}>
          <ArticleThumb
            article={article}
            noImageLabel={labels.noImage}
            variant="categoryCard"
            objectFit="cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 40vw, 28vw"
          />
        </div>
      </Link>
      <div className="pt-3">
        <StoryMetaLine article={article} locale={displayLocale} />
        <h3 className="mt-2 text-lg font-bold leading-snug text-neutral-950 sm:text-xl">
          <Link href={href} className="line-clamp-3 hover:underline">
            {article.title}
          </Link>
        </h3>
        {article.summary ? (
          <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-neutral-600">
            {truncateSummary(article.summary, 140, displayLocale)}
          </p>
        ) : null}
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
  const slugOk = Boolean(article.slug?.trim());
  const href =
    articleHrefFor || slugOk
      ? resolveArticleHref(article, articleHrefPrefix, articleHrefFor)
      : null;

  return (
    <article className="border-b border-neutral-200 py-3 last:border-b-0 last:pb-0">
      <div className="flex gap-2.5">
        <span className="mt-0.5 w-5 shrink-0 text-[13px] font-bold tabular-nums text-news-red">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            {getSourceLabel(article.source, article.original_url, locale)}
          </p>
          <h3 className="mt-0.5 text-[14px] font-semibold leading-snug text-neutral-900">
            {href ? (
              <Link href={href} className="line-clamp-2 hover:underline">
                {article.title}
              </Link>
            ) : (
              <span className="line-clamp-2">{article.title}</span>
            )}
          </h3>
          <time
            dateTime={article.published_at ?? article.created_at}
            className="mt-1 block text-[12px] text-neutral-500"
          >
            {listDateText(article, displayLocale)}
          </time>
        </div>
      </div>
    </article>
  );
}

/** Vertical ranked list — left rail on desktop, after trending on mobile. */
function SpotlightRail({
  articles,
  locale,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  articles: HomeArticleCard[];
  locale: ArticleLocale;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  return (
    <section id="sidebar" className="min-w-0 scroll-mt-6 border-t border-neutral-300 pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {labels.sidebarEyebrow}
      </p>
      <h2 className="mt-1 border-b border-neutral-200 pb-2 text-[15px] font-bold text-news-navy">
        {labels.sidebarTitle}
      </h2>
      <div className="mt-1">
        {articles.map((article, index) => (
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
  );
}

/** Desktop default: up to 8 photo leads across a fluid 3–4 column grid. */
const SOURCE_LEAD_DISPLAY_LIMIT = 8;

function SourceLeadMini({
  article,
  sourceLabel,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  article: HomeArticleCard;
  sourceLabel: string;
  labels: HomeNewsLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="min-w-0">
      <Link href={href} className="block">
        <div className={newsThumbFrameForVariant("sourceCard")}>
          <ArticleThumb
            article={article}
            noImageLabel={labels.noImage}
            variant="sourceCard"
            objectFit="cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        </div>
      </Link>
      <div className="border-b border-neutral-200 pb-3 pt-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          {sourceLabel}
        </p>
        <h3 className="mt-1 text-[14px] font-semibold leading-snug text-neutral-950 sm:text-[15px]">
          <Link href={href} className="line-clamp-2 hover:underline">
            {article.title}
          </Link>
        </h3>
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
  const [searchQuery, setSearchQuery] = useState("");
  const [localSourceGroup, setLocalSourceGroup] =
    useState<HomeSourceGroup>("all");
  const [localSourceTabKey, setLocalSourceTabKey] = useState<string | null>(
    null
  );
  const [localCategoryTab, setLocalCategoryTab] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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
  const todayEditionMeta = displaySections.todayEdition;
  const isCarryover = todayEditionMeta?.status === "carryover";
  const isPreparing = todayEditionMeta?.status === "preparing";
  const showFeaturedSection =
    showFeatured || isPreparing || isCarryover;
  const showPreviousHighlights =
    (displaySections.previousHighlights?.length ?? 0) > 0;
  const topStories = displaySections.topStories;
  const topStoriesHasLeft = (topStories?.left.length ?? 0) > 0;
  const topStoriesHasRight = (topStories?.right.length ?? 0) > 0;
  const showTopStories = Boolean(
    topStories && (topStoriesHasLeft || topStoriesHasRight)
  );
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
    showFeatured && featuredHub.leads.length > 0;
  const showTopStoriesBand = shouldShowTopStoriesBand({
    showTopStories,
    isCarryover,
    useFeaturedComboLayout,
  });
  const showLatestFallbackSection = shouldShowLatestFallbackSection({
    showTopStoriesBand,
    useFeaturedComboLayout,
    latestCount: displaySections.latest.length,
  });
  const showSidebar = displaySections.sidebar.length > 0;
  const trendingIssues = displaySections.trendingIssues;
  const showTrending = Boolean(
    trendingIssues &&
      (trendingIssues.us.length > 0 || trendingIssues.kr.length > 0)
  );
  const showPreviousHighlightsInRightRail =
    !showTrending && showPreviousHighlights;
  const showPreviousHighlightsBelow =
    showPreviousHighlights && !showPreviousHighlightsInRightRail;
  const sourceFromUrl = parseHomeSourceFilter(searchParams.get("source"));
  const categoryFromUrl = parseHomeCategoryFilter(searchParams.get("category"));

  const globalCategoryFilter = useMemo(() => {
    if (!categoryFromUrl) return null;
    if (displaySections.groupedByCategory[categoryFromUrl]?.length) {
      return categoryFromUrl;
    }
    const match = displaySections.visibleCategories.find(
      (c) => c === categoryFromUrl
    );
    return match ?? null;
  }, [categoryFromUrl, displaySections]);

  const isFilterResultMode = isGlobalHomeFilterMode({
    sourceFromUrl,
    categoryFromUrl: globalCategoryFilter,
  });

  const showFeaturedBlock = showFeaturedSection && !isFilterResultMode;
  const centerBandRowClass = centerBandGridRowClass(showFeaturedBlock);

  const selectedSourceLabel = useMemo(() => {
    if (!sourceFromUrl) return null;
    const match = sourceFilterOptions.find(
      (label) => normalizeSource(label) === sourceFromUrl
    );
    if (match) return match;
    return getSourceLabel(sourceFromUrl, null, locale);
  }, [sourceFromUrl, sourceFilterOptions, locale]);

  const filteredSourceLeadCards = useMemo(() => {
    const filtered = filterSourceLeadCardsByGroup(
      displaySections.sourceLeadCards,
      localSourceGroup,
      localSourceTabKey
    );
    if (!localSourceTabKey && localSourceGroup === "all") {
      return filtered.slice(0, SOURCE_LEAD_DISPLAY_LIMIT);
    }
    return filtered;
  }, [
    displaySections.sourceLeadCards,
    localSourceGroup,
    localSourceTabKey,
  ]);

  const activeSourceKeys = useMemo(
    () =>
      new Set(
        displaySections.sourceLeadCards.map((c) => normalizeSource(c.key))
      ),
    [displaySections.sourceLeadCards]
  );

  const sourceTabsForGroup = useMemo(
    () => featuredConfigsForGroup(localSourceGroup),
    [localSourceGroup]
  );

  const selectSourceGroup = useCallback((group: HomeSourceGroup) => {
    setLocalSourceGroup(group);
    setLocalSourceTabKey(null);
  }, []);

  const filteredGroupedByCategory = useMemo(() => {
    if (!localSourceTabKey) return displaySections.groupedByCategory;
    const out: Record<string, HomeArticleCard[]> = {};
    for (const [category, items] of Object.entries(
      displaySections.groupedByCategory
    )) {
      out[category] = items.filter(
        (article) => normalizeSource(article.source) === localSourceTabKey
      );
    }
    return out;
  }, [displaySections.groupedByCategory, localSourceTabKey]);
  const filteredVisibleCategories = useMemo(
    () =>
      displaySections.visibleCategories.filter(
        (category) => (filteredGroupedByCategory[category]?.length ?? 0) > 0
      ),
    [displaySections.visibleCategories, filteredGroupedByCategory]
  );
  const showCategories = filteredVisibleCategories.length > 0;

  useEffect(() => {
    if (!categoryFromUrl) return;
    if (globalCategoryFilter) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("category");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [
    categoryFromUrl,
    globalCategoryFilter,
    pathname,
    router,
    searchParams,
  ]);

  const selectedCategory = useMemo(() => {
    if (
      localCategoryTab &&
      filteredVisibleCategories.includes(localCategoryTab)
    ) {
      return localCategoryTab;
    }
    return filteredVisibleCategories[0] ?? null;
  }, [localCategoryTab, filteredVisibleCategories]);

  const selectLocalCategory = useCallback((category: string) => {
    setLocalCategoryTab(category);
  }, []);

  const selectedCategoryArticles = selectedCategory
    ? (filteredGroupedByCategory[selectedCategory] ?? []).slice(0, 6)
    : [];
  const selectedCategoryTotal = selectedCategory
    ? filteredGroupedByCategory[selectedCategory]?.length ?? 0
    : 0;

  const filterResultArticles = useMemo(() => {
    if (!isFilterResultMode || searchArticles.length === 0) return [];
    return buildHomeFilterResults(searchArticles, {
      sourceKey: sourceFromUrl,
      categoryKey: globalCategoryFilter,
    });
  }, [
    isFilterResultMode,
    searchArticles,
    sourceFromUrl,
    globalCategoryFilter,
  ]);

  const filteredArticleCount = filterResultArticles.length;

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("source");
    params.delete("category");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const showActiveFilterBanner = isFilterResultMode;

  const showEditionHome =
    !isFilterResultMode &&
    (showFeaturedSection ||
      showTopStoriesBand ||
      showSidebar ||
      showTrending ||
      showPreviousHighlights);

  const homeGridClass = shouldUseNewspaperThreeColGrid({ showEditionHome })
    ? newsHomeThreeColGrid
    : "min-w-0";
  const showLeftRailContent = showSidebar;
  const showRightRail = showTrending || showPreviousHighlightsInRightRail;

  const trendingPanel = showTrending && trendingIssues && !isFilterResultMode ? (
    <TrendingIssuesPanel
      block={trendingIssues}
      articleHrefPrefix={articleHrefPrefix}
      locale={locale}
      labels={{
        title: labels.trendingTitle,
        regionUs: labels.trendingRegionUs,
        regionKr: labels.trendingRegionKr,
        relatedArticlesLabel: labels.trendingRelatedLabel,
        originalSourceLabel: labels.trendingOriginalLabel,
        continuingIssueLabel: labels.continuingIssueLabel,
      }}
    />
  ) : null;
  const previousHighlightsRail =
    showPreviousHighlightsInRightRail &&
    displaySections.previousHighlights &&
    !isFilterResultMode ? (
      <PreviousHighlightsRail
        articles={displaySections.previousHighlights}
        locale={locale}
        labels={labels}
        articleHrefPrefix={articleHrefPrefix}
        articleHrefFor={articleHrefFor}
      />
    ) : null;

  const showSources =
    filteredSourceLeadCards.length > 0 || sourceFilterOptions.length > 0;
  const pageTitle = getBrandName(pageRole);

  const hasArticles =
    showFeaturedSection ||
    showTopStories ||
    displaySections.latest.length > 0 ||
    displaySections.sidebar.length > 0 ||
    showPreviousHighlights ||
    filteredVisibleCategories.length > 0 ||
    isFilterResultMode;

  const headerDate = headerDateText ?? labels.edition;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-950">
      <header className="border-b-2 border-news-red bg-white">
        <div className={`${newsPageShell} py-4 sm:py-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-news-red">
                {showDateInHeader ? headerDate : labels.edition}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-news-navy sm:text-[2.125rem]">
                {pageTitle}
              </h1>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-neutral-600 sm:text-sm">
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
                className="flex shrink-0 flex-nowrap items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-1.5 lg:justify-end [&::-webkit-scrollbar]:hidden"
              >
                {hasArticles ? (
                  <>
                    {showFeaturedSection ? (
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

      <div className={`${newsPageShell} py-6 sm:py-8 lg:py-10`}>
        {normalizedSearch ? (
          <p className="mb-6 border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
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
        {showActiveFilterBanner ? (
          <div
            className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700"
            role="status"
          >
            <p>
              {locale === "ko" ? (
                <>
                  필터:{" "}
                  {sourceFromUrl && selectedSourceLabel ? (
                    <span className="font-semibold text-news-navy">
                      {selectedSourceLabel}
                    </span>
                  ) : null}
                  {sourceFromUrl && globalCategoryFilter ? " · " : null}
                  {globalCategoryFilter ? (
                    <span className="font-semibold text-news-navy">
                      {getCategoryLabel(globalCategoryFilter, locale)}
                    </span>
                  ) : null}
                  {" · "}
                  {filteredArticleCount}건
                </>
              ) : (
                <>
                  Filter:{" "}
                  {sourceFromUrl && selectedSourceLabel ? (
                    <span className="font-semibold text-news-navy">
                      {selectedSourceLabel}
                    </span>
                  ) : null}
                  {sourceFromUrl && globalCategoryFilter ? " · " : null}
                  {globalCategoryFilter ? (
                    <span className="font-semibold text-news-navy">
                      {getCategoryLabel(globalCategoryFilter, locale)}
                    </span>
                  ) : null}
                  {" · "}
                  {filteredArticleCount}{" "}
                  {filteredArticleCount === 1 ? "result" : "results"}
                </>
              )}
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className={`shrink-0 ${homePillButtonClass()}`}
            >
              {locale === "ko" ? "필터 해제" : "Clear filters"}
            </button>
          </div>
        ) : null}
        {showActiveFilterBanner && filteredArticleCount === 0 ? (
          <p
            className="mb-6 border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-600"
            role="status"
          >
            {locale === "ko"
              ? "선택한 필터에 해당하는 공개 기사가 없습니다."
              : "No published articles match the selected filters."}
          </p>
        ) : null}
        {isFilterResultMode && filterResultArticles.length > 0 ? (
          <section
            id="filter-results"
            className="mb-8 min-w-0 scroll-mt-6"
            aria-labelledby="home-filter-results"
          >
            <SectionHeading
              eyebrow={locale === "ko" ? "필터 결과" : "Filter results"}
              title={
                locale === "ko"
                  ? "공개 기사 목록"
                  : "Published articles"
              }
            />
            <div>
              {filterResultArticles.map((article) => (
                <StoryListRow
                  key={article.article_id ?? article.id}
                  article={article}
                  locale={locale}
                  labels={labels}
                  articleHrefPrefix={articleHrefPrefix}
                  articleHrefFor={articleHrefFor}
                />
              ))}
            </div>
          </section>
        ) : null}
        {errorMessage ? (
          <div
            className="mb-8 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {labels.errorPrefix} {errorMessage}
          </div>
        ) : null}

        {!errorMessage && !hasArticles ? (
          <p className="border border-neutral-200 bg-white py-14 text-center text-neutral-600">
            {labels.empty}
          </p>
        ) : null}

        {!errorMessage && hasArticles && showEditionHome ? (
          <div className={homeGridClass}>
            {todayEditionMeta && !isFilterResultMode ? (
              <TodayEditionHeader meta={todayEditionMeta} locale={locale} />
            ) : null}

            {/* Left rail — mobile after trending; column always reserved on desktop */}
            {!isFilterResultMode ? (
              <aside
                className={`order-3 min-w-0 xl:order-none xl:row-start-2 ${homeLeftRailColClass()}`}
              >
                {showLeftRailContent ? (
                  <SpotlightRail
                    articles={displaySections.sidebar}
                    locale={locale}
                    labels={labels}
                    articleHrefPrefix={articleHrefPrefix}
                    articleHrefFor={articleHrefFor}
                  />
                ) : null}
              </aside>
            ) : null}

            {/* Center: featured or preparing */}
            {showFeaturedSection && !isFilterResultMode ? (
              <section
                id="featured"
                className={`order-1 min-w-0 scroll-mt-6 xl:order-none xl:row-start-2 ${homeFeaturedCenterColClass()}`}
                aria-labelledby="home-featured"
              >
                <SectionHeading
                  eyebrow={labels.featuredEyebrow}
                  title={labels.featuredTitle}
                />
                {isPreparing && !showFeatured && !isCarryover ? (
                  <TodayEditionPreparing meta={todayEditionMeta!} locale={locale} />
                ) : useFeaturedComboLayout ? (
                  <FeaturedWithRelated
                    leads={featuredHub.leads}
                    related={featuredHub.related}
                    locale={locale}
                    labels={labels}
                    articleHrefPrefix={articleHrefPrefix}
                    articleHrefFor={articleHrefFor}
                  />
                ) : displaySections.featured ? (
                  <FeaturedHero
                    article={displaySections.featured}
                    locale={locale}
                    labels={labels}
                    articleHrefPrefix={articleHrefPrefix}
                    articleHrefFor={articleHrefFor}
                  />
                ) : null}
              </section>
            ) : null}

            {/* Right rail — column always reserved on desktop */}
            {!isFilterResultMode ? (
              <aside
                className={`order-2 min-w-0 xl:order-none xl:row-start-2 xl:row-span-2 ${homeRightRailColClass()}`}
              >
                {showRightRail ? trendingPanel ?? previousHighlightsRail : null}
              </aside>
            ) : null}

            {/* Mid band: latest / top stories — left+center while issues continue */}
            {showTopStoriesBand && topStories && !isFilterResultMode ? (
              <section
                id="latest"
                className={`order-1 min-w-0 scroll-mt-6 xl:order-none ${centerBandRowClass} ${centerBandGridColClass()}`}
              >
                <SectionHeading
                  eyebrow={labels.latestEyebrow}
                  title={labels.latestTitle}
                  description={labels.latestDesc}
                />
                <div
                  className={
                    topStoriesHasLeft && topStoriesHasRight
                      ? "grid min-w-0 gap-8 sm:grid-cols-2 sm:gap-10"
                      : "min-w-0"
                  }
                >
                  {topStoriesHasLeft ? (
                    <TopStoriesColumn
                      title={topStories.leftTitle}
                      articles={topStories.left}
                      emptyLabel={labels.columnEmpty}
                      locale={locale}
                      labels={labels}
                      articleHrefPrefix={articleHrefPrefix}
                      articleHrefFor={articleHrefFor}
                      accentClass={
                        pageRole === "ko" ? "border-news-red" : "border-news-navy"
                      }
                    />
                  ) : null}
                  {topStoriesHasRight ? (
                    <TopStoriesColumn
                      title={topStories.rightTitle}
                      articles={topStories.right}
                      emptyLabel={labels.columnEmpty}
                      locale={locale}
                      labels={labels}
                      articleHrefPrefix={articleHrefPrefix}
                      articleHrefFor={articleHrefFor}
                      accentClass={
                        pageRole === "ko" ? "border-news-navy" : "border-news-red"
                      }
                    />
                  ) : null}
                </div>
              </section>
            ) : null}

            {showLatestFallbackSection && !isFilterResultMode ? (
              <section
                id="latest"
                className={`order-1 min-w-0 scroll-mt-6 xl:order-none ${centerBandRowClass} ${centerBandGridColClass()}`}
              >
                <SectionHeading
                  eyebrow={labels.latestEyebrow}
                  title={labels.latestTitle}
                  description={labels.latestDesc}
                />
                <div>
                  {displaySections.latest.map((article, index) => (
                    <LatestRow
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
              </section>
            ) : null}

            {showPreviousHighlightsBelow && displaySections.previousHighlights && !isFilterResultMode ? (
              <PreviousHighlightsSection
                articles={displaySections.previousHighlights}
                locale={locale}
                labels={labels}
                articleHrefPrefix={articleHrefPrefix}
                articleHrefFor={articleHrefFor}
              />
            ) : null}

            {/* Full-bleed lower sections */}
            {showSources && !isFilterResultMode ? (
              <section
                id="sources"
                className={`order-5 min-w-0 scroll-mt-6 border-t border-neutral-300 pt-8 xl:order-none xl:col-span-full ${
                  showPreviousHighlightsBelow ? "xl:row-start-4" : "xl:row-start-3"
                }`}
              >
                <SectionHeading
                  eyebrow={labels.sourcesEyebrow}
                  title={labels.sourcesTitle}
                  description={labels.sourcesDesc}
                />

                <div
                  role="tablist"
                  aria-label={
                    locale === "ko" ? "언론사 그룹" : "Source groups"
                  }
                  className="mb-3 flex flex-wrap gap-x-1 gap-y-1 border-b border-neutral-200 pb-3"
                >
                  {(["all", "foreign", "korean"] as const).map((group) => (
                    <button
                      key={group}
                      type="button"
                      role="tab"
                      aria-selected={localSourceGroup === group}
                      onClick={() => selectSourceGroup(group)}
                      className={homeSectionTabClass(localSourceGroup === group)}
                    >
                      {homeSourceGroupButtonLabels(locale)[group]}
                    </button>
                  ))}
                </div>

                <div
                  role="tablist"
                  aria-label={labels.sourcesTitle}
                  className="mb-5 flex flex-wrap gap-x-1 gap-y-1 border-b border-neutral-200"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!localSourceTabKey}
                    onClick={() => setLocalSourceTabKey(null)}
                    className={homeSectionTabClass(!localSourceTabKey)}
                  >
                    {sourceFilterAllLabel}
                  </button>
                  {sourceTabsForGroup.map((config) => {
                    const key = normalizeSource(config.key);
                    const hasSource = activeSourceKeys.has(key);
                    const selected = localSourceTabKey === key;
                    const label = displaySourceTabLabel(config, locale);
                    return (
                      <button
                        key={config.key}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        disabled={!hasSource}
                        onClick={() => {
                          if (hasSource) setLocalSourceTabKey(key);
                        }}
                        className={homeSectionTabClass(selected, hasSource)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <h3 className="mb-4 text-[15px] font-bold text-news-navy">
                  {labels.sourceLeadsTitle}
                </h3>
                {filteredSourceLeadCards.length === 0 ? (
                  <p
                    className="border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-600"
                    role="status"
                  >
                    {locale === "ko"
                      ? "선택한 언론사 그룹에 표시할 공개 기사가 없습니다."
                      : "No published articles for the selected source group."}
                  </p>
                ) : (
                <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredSourceLeadCards.map((item) => (
                    <SourceLeadMini
                      key={item.key}
                      article={item.article}
                      sourceLabel={displaySourceTabLabel(item, locale)}
                      labels={labels}
                      articleHrefPrefix={articleHrefPrefix}
                      articleHrefFor={articleHrefFor}
                    />
                  ))}
                </div>
                )}
              </section>
            ) : null}

            {showCategories && !isFilterResultMode ? (
              <section
                id="categories"
                className={`order-6 min-w-0 scroll-mt-6 border-t border-neutral-300 pt-8 xl:order-none xl:col-span-full ${
                  showPreviousHighlightsBelow ? "xl:row-start-5" : "xl:row-start-4"
                }`}
              >
                <SectionHeading
                  eyebrow={labels.categoriesEyebrow}
                  title={labels.categoriesTitle}
                />
                <div
                  role="tablist"
                  aria-label={labels.categoriesTitle}
                  className="mb-5 flex flex-wrap gap-x-1 gap-y-0 border-b border-neutral-200"
                >
                  {filteredVisibleCategories.map((category) => {
                    const selected = selectedCategory === category;
                    const total =
                      filteredGroupedByCategory[category]?.length ?? 0;
                    return (
                      <button
                        key={category}
                        type="button"
                        role="tab"
                        id={`category-tab-${category}`}
                        aria-selected={selected}
                        aria-controls="category-panel"
                        tabIndex={selected ? 0 : -1}
                        onClick={() => selectLocalCategory(category)}
                        onKeyDown={(event) => {
                          if (
                            event.key !== "ArrowRight" &&
                            event.key !== "ArrowLeft"
                          ) {
                            return;
                          }
                          event.preventDefault();
                          const idx =
                            filteredVisibleCategories.indexOf(category);
                          const nextIdx =
                            event.key === "ArrowRight"
                              ? (idx + 1) % filteredVisibleCategories.length
                              : (idx - 1 + filteredVisibleCategories.length) %
                                filteredVisibleCategories.length;
                          selectLocalCategory(filteredVisibleCategories[nextIdx]!);
                        }}
                        className={homeSectionTabClass(selected)}
                      >
                        {getCategoryLabel(category, locale)}
                        <span className="ml-1.5 font-normal opacity-60">
                          {formatCategoryCount(locale, total)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  id="category-panel"
                  role="tabpanel"
                  aria-labelledby={
                    selectedCategory
                      ? `category-tab-${selectedCategory}`
                      : undefined
                  }
                  className="min-w-0"
                >
                  {selectedCategory && selectedCategoryTotal > 0 ? (
                    <>
                      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-300 pb-2">
                        <h3 className="text-lg font-bold text-news-navy">
                          {getCategoryLabel(selectedCategory, locale)}
                        </h3>
                        <span className="text-sm text-neutral-500">
                          {formatCategoryCount(locale, selectedCategoryTotal)}
                        </span>
                      </div>
                      {selectedCategoryArticles.length > 0 ? (
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-8">
                          <CategoryLead
                            article={selectedCategoryArticles[0]}
                            locale={locale}
                            labels={labels}
                            articleHrefPrefix={articleHrefPrefix}
                            articleHrefFor={articleHrefFor}
                          />
                          <div>
                            {selectedCategoryArticles.slice(1).map((article) => (
                              <StoryListRow
                                key={article.id}
                                article={article}
                                locale={locale}
                                labels={labels}
                                articleHrefPrefix={articleHrefPrefix}
                                articleHrefFor={articleHrefFor}
                                summaryLen={90}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-600">
                      {labels.categoriesEmpty}
                    </p>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
