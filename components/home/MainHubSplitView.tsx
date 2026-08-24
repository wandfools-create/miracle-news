import type { ReactNode } from "react";
import Link from "next/link";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import {
  formatHomeListDate,
  truncateSummary,
} from "@/lib/home/formatHomeListDate";
import { newsPageShell } from "@/lib/home/newsPageLayout";
import { resolveArticleHref } from "@/lib/home/resolveArticleHref";
import { socialPlatformLabel } from "@/lib/home/socialSource";
import { CATEGORY_SLICE } from "@/lib/home/prepareMainHubSplitSections";
import type { MainHubColumnSections, MainHubSplitSections } from "@/lib/home/mainHubSplitTypes";
import { getSourceLabel } from "@/lib/koreanArticleDisplay";
import type { HomeArticleCard } from "@/lib/home/types";
import type { HomeNewsLabels } from "./HomeNewsView";
import NewsThumbnail from "@/components/home/NewsThumbnail";

export type MainHubSplitLabels = HomeNewsLabels & {
  usColumnTitle: string;
  krColumnTitle: string;
  usColumnDesc: string;
  krColumnDesc: string;
  socialEyebrow: string;
  socialTitle: string;
  socialDesc: string;
  columnEmpty: string;
};

function formatCategoryCount(locale: ArticleLocale, n: number): string {
  if (locale === "ko") return `공개 ${n}건`;
  return `${n} published ${n === 1 ? "story" : "stories"}`;
}

type MainHubSplitViewProps = {
  sections: MainHubSplitSections;
  labels: MainHubSplitLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
  homeHref: string;
  alternateLangHref: string;
  errorMessage?: string | null;
  showDateInHeader?: boolean;
};

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
    <header className="mb-3 border-b border-neutral-200/80 pb-2.5 sm:mb-4 sm:pb-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-news-red">
        {eyebrow}
      </p>
      <h3 className="mt-0.5 text-lg font-bold tracking-tight text-news-navy sm:text-xl">
        {title}
      </h3>
      {description ? (
        <p className="mt-1 text-xs leading-relaxed text-neutral-600 sm:text-sm">
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
}: {
  article: HomeArticleCard;
  noImageLabel: string;
  priority?: boolean;
}) {
  return (
    <NewsThumbnail
      article={article}
      noImageLabel={noImageLabel}
      priority={priority}
      useNextImage={false}
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
  const date = formatHomeListDate(
    article.published_at ?? article.created_at,
    displayLocale
  );

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-neutral-500">
      {article.locale ? (
        <>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
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

function ColumnFeatured({
  article,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  article: HomeArticleCard;
  labels: MainHubSplitLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const displayLocale = article.locale ?? "ko";
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50/80">
      <Link href={href} className="block bg-white">
        <div className="flex aspect-[16/10] w-full max-h-[280px] items-center justify-center overflow-hidden bg-white">
          <ArticleThumb
            article={article}
            noImageLabel={labels.noImage}
            priority
          />
        </div>
      </Link>
      <div className="p-4 sm:p-5">
        <StoryMetaLine article={article} locale={displayLocale} />
        <h4 className="mt-2 text-lg font-bold leading-snug text-news-navy sm:text-xl">
          <Link href={href} className="hover:text-news-red hover:underline">
            {article.title}
          </Link>
        </h4>
        {article.summary ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-neutral-600">
            {truncateSummary(article.summary, 160, displayLocale)}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ColumnLatestRow({
  article,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  article: HomeArticleCard;
  labels: MainHubSplitLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const displayLocale = article.locale ?? "ko";
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="border-b border-neutral-200 py-3 last:border-b-0 last:pb-0">
      <StoryMetaLine article={article} locale={displayLocale} />
      <h4 className="mt-1.5 text-sm font-bold leading-snug text-neutral-950 sm:text-[15px]">
        <Link href={href} className="line-clamp-2 hover:underline">
          {article.title}
        </Link>
      </h4>
    </article>
  );
}

function ColumnCategoryItem({
  article,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  article: HomeArticleCard;
  labels: MainHubSplitLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const displayLocale = article.locale ?? "ko";
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="rounded-md border border-neutral-200/90 bg-white p-3">
      <StoryMetaLine article={article} locale={displayLocale} />
      <h4 className="mt-1.5 text-sm font-semibold leading-snug">
        <Link href={href} className="line-clamp-2 hover:underline">
          {article.title}
        </Link>
      </h4>
    </article>
  );
}

function ColumnSourceMini({
  article,
  sourceLabel,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  article: HomeArticleCard;
  sourceLabel: string;
  labels: MainHubSplitLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const displayLocale = article.locale ?? "ko";
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);

  return (
    <article className="rounded-md border border-neutral-200 bg-white p-3">
      <span className="inline-flex rounded bg-neutral-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        {sourceLabel}
      </span>
      <h4 className="mt-1.5 text-sm font-semibold leading-snug">
        <Link href={href} className="line-clamp-2 hover:underline">
          {article.title}
        </Link>
      </h4>
      <p className="mt-1 text-xs text-neutral-500">
        {formatHomeListDate(
          article.published_at ?? article.created_at,
          displayLocale
        )}
      </p>
    </article>
  );
}

function ColumnSocialRow({
  article,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  article: HomeArticleCard;
  labels: MainHubSplitLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const displayLocale = article.locale ?? "ko";
  const href = resolveArticleHref(article, articleHrefPrefix, articleHrefFor);
  const platform = socialPlatformLabel(article);

  return (
    <article className="flex gap-3 border-b border-neutral-200 py-3 last:border-b-0">
      <Link
        href={href}
        className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-white"
      >
        <ArticleThumb article={article} noImageLabel={labels.noImage} />
      </Link>
      <div className="min-w-0 flex-1">
        <span className="inline-flex rounded-full bg-violet-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {platform}
        </span>
        <StoryMetaLine article={article} locale={displayLocale} />
        <h4 className="mt-1 text-sm font-semibold leading-snug">
          <Link href={href} className="line-clamp-2 hover:underline">
            {article.title}
          </Link>
        </h4>
      </div>
    </article>
  );
}

function columnHasContent(column: MainHubColumnSections): boolean {
  return (
    Boolean(column.featured) ||
    column.latest.length > 0 ||
    column.visibleCategories.length > 0 ||
    column.sourceLeadCards.length > 0 ||
    column.socialArticles.length > 0
  );
}

function RegionColumn({
  column,
  columnTitle,
  columnDesc,
  columnId,
  accentClass,
  headerClass,
  labels,
  articleHrefPrefix,
  articleHrefFor,
}: {
  column: MainHubColumnSections;
  columnTitle: string;
  columnDesc: string;
  columnId: string;
  accentClass: string;
  headerClass: string;
  labels: MainHubSplitLabels;
  articleHrefPrefix: string;
  articleHrefFor?: (article: HomeArticleCard) => string;
}) {
  const locale: ArticleLocale = column.region === "kr" ? "ko" : "en";
  const hasContent = columnHasContent(column);

  return (
    <section
      id={columnId}
      className="scroll-mt-6 flex min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
      aria-labelledby={`${columnId}-heading`}
    >
      <div className={`border-t-4 ${accentClass} ${headerClass} px-4 py-4 sm:px-5`}>
        <h2
          id={`${columnId}-heading`}
          className="text-xl font-bold tracking-tight text-news-navy sm:text-2xl"
        >
          {columnTitle}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">{columnDesc}</p>
      </div>

      <div className="flex flex-1 flex-col gap-8 p-4 sm:p-5 lg:p-6">
        {!hasContent ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            {labels.columnEmpty}
          </p>
        ) : null}

        {column.featured ? (
          <div>
            <SectionHeading
              eyebrow={labels.featuredEyebrow}
              title={labels.featuredTitle}
            />
            <ColumnFeatured
              article={column.featured}
              labels={labels}
              articleHrefPrefix={articleHrefPrefix}
              articleHrefFor={articleHrefFor}
            />
          </div>
        ) : null}

        {column.latest.length > 0 ? (
          <div>
            <SectionHeading
              eyebrow={labels.latestEyebrow}
              title={labels.latestTitle}
            />
            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-1">
              {column.latest.map((article) => (
                <ColumnLatestRow
                  key={article.id}
                  article={article}
                  labels={labels}
                  articleHrefPrefix={articleHrefPrefix}
                  articleHrefFor={articleHrefFor}
                />
              ))}
            </div>
          </div>
        ) : null}

        {column.sourceLeadCards.length > 0 ? (
          <div>
            <SectionHeading
              eyebrow={labels.sourcesEyebrow}
              title={labels.sourceLeadsTitle}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {column.sourceLeadCards.map((item) => (
                <ColumnSourceMini
                  key={item.key}
                  article={item.article}
                  sourceLabel={item.label}
                  labels={labels}
                  articleHrefPrefix={articleHrefPrefix}
                  articleHrefFor={articleHrefFor}
                />
              ))}
            </div>
          </div>
        ) : null}

        {column.visibleCategories.length > 0 ? (
          <div>
            <SectionHeading
              eyebrow={labels.categoriesEyebrow}
              title={labels.categoriesTitle}
            />
            <div className="space-y-6">
              {column.visibleCategories.map((category) => {
                const items = column.groupedByCategory[category].slice(
                  0,
                  CATEGORY_SLICE
                );
                const total = column.groupedByCategory[category].length;

                return (
                  <div key={category}>
                    <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-news-red/50 pb-1.5">
                      <h4 className="text-sm font-bold text-news-navy">
                        {getCategoryLabel(category, locale)}
                      </h4>
                      <span className="text-xs text-neutral-500">
                        {formatCategoryCount(locale, total)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {items.map((article) => (
                        <ColumnCategoryItem
                          key={article.id}
                          article={article}
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
          </div>
        ) : null}

        {column.socialArticles.length > 0 ? (
          <div>
            <SectionHeading
              eyebrow={labels.socialEyebrow}
              title={labels.socialTitle}
              description={labels.socialDesc}
            />
            <div className="rounded-lg border border-violet-200/80 bg-violet-50/30 px-3 py-1">
              {column.socialArticles.map((article) => (
                <ColumnSocialRow
                  key={article.id}
                  article={article}
                  labels={labels}
                  articleHrefPrefix={articleHrefPrefix}
                  articleHrefFor={articleHrefFor}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function MainHubSplitView({
  sections,
  labels,
  articleHrefPrefix,
  articleHrefFor,
  alternateLangHref,
  errorMessage,
  showDateInHeader = false,
}: MainHubSplitViewProps) {
  const hasArticles =
    columnHasContent(sections.us) || columnHasContent(sections.kr);

  const headerDate = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <main className="min-h-screen bg-[#f4f3ef] text-neutral-950">
      <header className="border-b-4 border-news-red bg-white">
        <div className={`${newsPageShell} py-5 sm:py-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-news-red">
                {showDateInHeader ? headerDate : labels.edition}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-news-navy sm:text-4xl">
                한눈
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600 sm:text-[15px]">
                {labels.tagline}
              </p>
            </div>

            <nav
              aria-label="Section navigation"
              className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 sm:gap-2 lg:max-w-[52%] lg:justify-end"
            >
              {hasArticles ? (
                <>
                  <NavPill href="#hub-us">{labels.usColumnTitle}</NavPill>
                  <NavPill href="#hub-kr">{labels.krColumnTitle}</NavPill>
                </>
              ) : null}
              <NavPill href="/ko">{labels.navHome}</NavPill>
              <NavPill href={alternateLangHref} variant="primary">
                {labels.alternateLang}
              </NavPill>
            </nav>
          </div>
        </div>
      </header>

      <div className={`${newsPageShell} py-8 sm:py-10 lg:py-12`}>
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
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-8 xl:gap-10">
            <RegionColumn
              column={sections.us}
              columnTitle={labels.usColumnTitle}
              columnDesc={labels.usColumnDesc}
              columnId="hub-us"
              accentClass="border-blue-800"
              headerClass="bg-slate-50"
              labels={labels}
              articleHrefPrefix={articleHrefPrefix}
              articleHrefFor={articleHrefFor}
            />
            <RegionColumn
              column={sections.kr}
              columnTitle={labels.krColumnTitle}
              columnDesc={labels.krColumnDesc}
              columnId="hub-kr"
              accentClass="border-news-red"
              headerClass="bg-red-50/60"
              labels={labels}
              articleHrefPrefix={articleHrefPrefix}
              articleHrefFor={articleHrefFor}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
