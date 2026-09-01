"use client";

import Link from "next/link";
import {
  formatPublishedDate,
  type ArticleLocale,
} from "@/lib/article/formatPublishedDate";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import { getSourceLabel } from "@/lib/koreanArticleDisplay";
import { trackAnalyticsEvent } from "@/components/analytics/AnalyticsPageView";
import type { RelatedArticleCard } from "./types";

type RelatedStoryItemProps = {
  article: RelatedArticleCard;
  hrefPrefix: string;
  locale: ArticleLocale;
  noImageLabel: string;
};

function trackRelatedClick(locale: ArticleLocale, article: RelatedArticleCard) {
  trackAnalyticsEvent({
    eventName: "related_article_click",
    locale,
    articleId: article.article_id,
  });
}

export default function RelatedStoryItem({
  article,
  hrefPrefix,
  locale,
  noImageLabel,
}: RelatedStoryItemProps) {
  const published = formatPublishedDate(article.published_at, locale);
  const href = `${hrefPrefix}/${article.slug}`;

  return (
    <article className="group border-b border-neutral-200/80 pb-4 last:border-b-0 last:pb-0">
      <div className="flex gap-3.5">
        <Link
          href={href}
          className="relative block h-[4.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-neutral-200/80"
          onClick={() => trackRelatedClick(locale, article)}
        >
          {article.thumbnail_url ? (
            <img
              src={article.thumbnail_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-neutral-400">
              {noImageLabel}
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-[11px] font-medium tracking-wide text-neutral-500">
            {getSourceLabel(article.source, article.original_url)} ·{" "}
            {getCategoryLabel(article.category, locale)}
          </p>

          <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-neutral-900">
            <Link
              href={href}
              className="hover:text-neutral-950 hover:underline decoration-neutral-400 underline-offset-2"
              onClick={() => trackRelatedClick(locale, article)}
            >
              {article.title}
            </Link>
          </h3>

          <time
            dateTime={article.published_at ?? undefined}
            className="mt-1.5 block text-xs text-neutral-500"
          >
            {published.full}
          </time>
        </div>
      </div>
    </article>
  );
}
