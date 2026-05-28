import Link from "next/link";
import type { ReactNode } from "react";
import {
  formatPublishedDate,
  type ArticleLocale,
} from "@/lib/article/formatPublishedDate";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import { getSourceLabel } from "@/lib/koreanArticleDisplay";
import RelatedStoryItem from "./RelatedStoryItem";
import type { ArticleDetailData, RelatedArticleCard } from "./types";

export type ArticleDetailLabels = {
  breadcrumbHome: string;
  viewOriginal: string;
  alternateVersion: string;
  sourceLabel: string;
  originalTitleLabel: string;
  bodyHeading: string;
  summaryHeading: string;
  emptyBody: string;
  footerNote?: string;
  sidebarInfoEyebrow: string;
  sidebarInfoTitle: string;
  sidebarSource: string;
  sidebarCategory: string;
  sidebarPublished: string;
  sidebarTopic: string;
  relatedTopicEyebrow: string;
  relatedTopicTitle: string;
  relatedCategoryEyebrow: string;
  relatedCategoryTitle: string;
  navEyebrow: string;
  navTitle: string;
  navHome: string;
  navOriginal: string;
  navAlternate?: string;
  noImage: string;
};

type ArticleDetailViewProps = {
  article: ArticleDetailData;
  paragraphs: string[];
  locale: ArticleLocale;
  labels: ArticleDetailLabels;
  homeHref: string;
  articleHrefPrefix: string;
  alternateVersionHref: string | null;
  sameTopicArticles: RelatedArticleCard[];
  sameCategoryArticles: RelatedArticleCard[];
};

function SidebarCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {eyebrow}
      </p>
      <h2 className="mt-1.5 text-base font-bold text-neutral-950">{title}</h2>
      {children}
    </section>
  );
}

export default function ArticleDetailView({
  article,
  paragraphs,
  locale,
  labels,
  homeHref,
  articleHrefPrefix,
  alternateVersionHref,
  sameTopicArticles,
  sameCategoryArticles,
}: ArticleDetailViewProps) {
  const sourceLabel = getSourceLabel(article.source, article.original_url);
  const published = formatPublishedDate(article.published_at, locale);
  const categoryLabel = getCategoryLabel(article.category, locale);

  return (
    <main className="min-h-screen bg-[#f6f5f2] text-neutral-950">
      {/* Masthead */}
      <header className="border-b border-neutral-200/90 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-6 text-sm text-neutral-500"
          >
            <Link
              href={homeHref}
              className="font-medium hover:text-neutral-900 hover:underline underline-offset-2"
            >
              {labels.breadcrumbHome}
            </Link>
            <span aria-hidden className="text-neutral-300">
              /
            </span>
            <span className="truncate">{sourceLabel}</span>
            <span aria-hidden className="text-neutral-300">
              /
            </span>
            <span>{categoryLabel}</span>
          </nav>

          <div className="pb-8 pt-5 lg:pb-10 lg:pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white">
                {sourceLabel}
              </span>
              <span className="inline-flex items-center rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                {categoryLabel}
              </span>
              {article.topic_label ? (
                <span className="inline-flex items-center rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                  {article.topic_label}
                </span>
              ) : null}
            </div>

            <h1 className="mt-5 max-w-4xl text-[1.75rem] font-bold leading-[1.28] tracking-[-0.025em] text-neutral-950 sm:text-[2.125rem] sm:leading-[1.26] lg:text-[2.5rem] lg:leading-[1.22]">
              {article.title}
            </h1>

            {article.summary ? (
              <p className="mt-5 max-w-3xl border-l-[3px] border-neutral-900/80 pl-4 text-lg font-medium leading-[1.65] text-neutral-700 sm:text-xl sm:leading-[1.6]">
                {article.summary}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-4 border-t border-neutral-100 pt-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="space-y-1">
                <time
                  dateTime={article.published_at ?? undefined}
                  className="block text-base font-semibold text-neutral-900 sm:text-lg"
                >
                  {published.primary}
                </time>
                {published.time ? (
                  <p className="text-sm text-neutral-500">{published.time}</p>
                ) : null}
                <p className="pt-1 text-sm text-neutral-500">
                  <span className="font-medium text-neutral-600">
                    {labels.sourceLabel}
                  </span>{" "}
                  {sourceLabel}
                  {locale === "ko" &&
                  article.title_original &&
                  article.title_original !== article.title ? (
                    <>
                      <span className="mx-2 text-neutral-300" aria-hidden>
                        ·
                      </span>
                      <span className="font-medium text-neutral-600">
                        {labels.originalTitleLabel}
                      </span>{" "}
                      <span className="text-neutral-600">
                        {article.title_original}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <a
                  href={article.original_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50"
                >
                  {labels.viewOriginal}
                </a>
                {alternateVersionHref ? (
                  <Link
                    href={alternateVersionHref}
                    className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
                  >
                    {labels.alternateVersion}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          {article.thumbnail_url ? (
            <figure className="pb-8 lg:pb-10">
              <div className="overflow-hidden rounded-xl bg-neutral-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-1 ring-neutral-200/80">
                <div className="aspect-[16/10] w-full max-h-[min(56vw,480px)] sm:aspect-[3/2] sm:max-h-[520px]">
                  <img
                    src={article.thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover object-center"
                  />
                </div>
              </div>
            </figure>
          ) : null}
        </div>
      </header>

      {/* Article + sidebar */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="grid gap-8 lg:gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
          <article className="min-w-0">
            <div className="mx-auto max-w-[42rem]">
              <div className="rounded-xl border border-neutral-200/90 bg-white px-5 py-7 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-8 sm:py-9">
                {article.summary && locale === "ko" ? (
                  <aside
                    aria-labelledby="article-summary-heading"
                    className="mb-8 rounded-lg border border-neutral-200/80 bg-neutral-50/80 px-5 py-4"
                  >
                    <h2
                      id="article-summary-heading"
                      className="text-xs font-bold uppercase tracking-[0.1em] text-neutral-500"
                    >
                      {labels.summaryHeading}
                    </h2>
                    <p className="mt-2.5 text-[1.0625rem] leading-[1.7] text-neutral-800">
                      {article.summary}
                    </p>
                  </aside>
                ) : null}

                <h2 className="sr-only">{labels.bodyHeading}</h2>

                {paragraphs.length > 0 ? (
                  <div className="article-prose space-y-5 text-[1.0625rem] leading-[1.85] tracking-[0.01em] text-neutral-800 sm:text-[1.125rem] sm:leading-[1.82] sm:space-y-6">
                    {paragraphs.map((paragraph, index) => (
                      <p
                        key={`${article.id}-${index}`}
                        className="whitespace-pre-line [text-wrap:pretty]"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-base leading-relaxed text-neutral-500">
                    {labels.emptyBody}
                  </p>
                )}

                {labels.footerNote ? (
                  <footer className="mt-10 border-t border-neutral-100 pt-6">
                    <p className="text-sm leading-relaxed text-neutral-500">
                      {labels.footerNote}
                    </p>
                  </footer>
                ) : null}
              </div>
            </div>
          </article>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <SidebarCard
              eyebrow={labels.sidebarInfoEyebrow}
              title={labels.sidebarInfoTitle}
            >
              <dl className="mt-4 space-y-3.5 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {labels.sidebarSource}
                  </dt>
                  <dd className="mt-1 font-medium text-neutral-800">
                    {sourceLabel}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {labels.sidebarCategory}
                  </dt>
                  <dd className="mt-1 font-medium text-neutral-800">
                    {categoryLabel}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {labels.sidebarPublished}
                  </dt>
                  <dd className="mt-1 font-medium text-neutral-800">
                    <time dateTime={article.published_at ?? undefined}>
                      {published.full}
                    </time>
                  </dd>
                </div>
                {article.topic_label ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      {labels.sidebarTopic}
                    </dt>
                    <dd className="mt-1 font-medium text-neutral-800">
                      {article.topic_label}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </SidebarCard>

            {sameTopicArticles.length > 0 ? (
              <SidebarCard
                eyebrow={labels.relatedTopicEyebrow}
                title={labels.relatedTopicTitle}
              >
                <div className="mt-4 space-y-4">
                  {sameTopicArticles.map((item) => (
                    <RelatedStoryItem
                      key={item.article_id}
                      article={item}
                      hrefPrefix={articleHrefPrefix}
                      locale={locale}
                      noImageLabel={labels.noImage}
                    />
                  ))}
                </div>
              </SidebarCard>
            ) : null}

            {sameCategoryArticles.length > 0 ? (
              <SidebarCard
                eyebrow={labels.relatedCategoryEyebrow}
                title={labels.relatedCategoryTitle}
              >
                <div className="mt-4 space-y-4">
                  {sameCategoryArticles.map((item) => (
                    <RelatedStoryItem
                      key={item.article_id}
                      article={item}
                      hrefPrefix={articleHrefPrefix}
                      locale={locale}
                      noImageLabel={labels.noImage}
                    />
                  ))}
                </div>
              </SidebarCard>
            ) : null}

            <SidebarCard eyebrow={labels.navEyebrow} title={labels.navTitle}>
              <ul className="mt-4 space-y-2.5 text-sm font-medium">
                <li>
                  <Link
                    href={homeHref}
                    className="text-neutral-700 hover:text-neutral-950 hover:underline underline-offset-2"
                  >
                    {labels.navHome}
                  </Link>
                </li>
                <li>
                  <a
                    href={article.original_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-700 hover:text-neutral-950 hover:underline underline-offset-2"
                  >
                    {labels.navOriginal}
                  </a>
                </li>
                {alternateVersionHref && labels.navAlternate ? (
                  <li>
                    <Link
                      href={alternateVersionHref}
                      className="text-neutral-700 hover:text-neutral-950 hover:underline underline-offset-2"
                    >
                      {labels.navAlternate}
                    </Link>
                  </li>
                ) : null}
              </ul>
            </SidebarCard>
          </aside>
        </div>
      </div>
    </main>
  );
}
