import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import type { HomeArticleCard } from "@/lib/home/types";
import { trackAnalyticsEvent } from "@/components/analytics/AnalyticsPageView";

export function resolveArticleAnalyticsId(article: {
  article_id?: string;
  id: string;
}): string | null {
  return article.article_id ?? article.id ?? null;
}

export function trackHomeArticleClick(
  locale: ArticleLocale,
  article: HomeArticleCard
) {
  const articleId = resolveArticleAnalyticsId(article);
  if (!articleId) return;
  trackAnalyticsEvent({
    eventName: "article_click",
    locale,
    articleId,
  });
}

export function trackSourceFilterClick(locale: ArticleLocale, sourceKey: string) {
  trackAnalyticsEvent({
    eventName: "source_filter_click",
    locale,
    sourceKey,
  });
}

export function trackCategoryFilterClick(
  locale: ArticleLocale,
  categoryKey: string
) {
  trackAnalyticsEvent({
    eventName: "category_filter_click",
    locale,
    categoryKey,
  });
}

export function trackLanguageSwitch(locale: AnalyticsLocale) {
  trackAnalyticsEvent({
    eventName: "language_switch",
    locale,
  });
}

type AnalyticsLocale = ArticleLocale;
