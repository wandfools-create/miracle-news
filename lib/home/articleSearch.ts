import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import { getPublishedTimestamp } from "@/lib/home/featuredSelection";
import { getArticleRegion } from "@/lib/home/articleRegion";
import { getSourceLabel } from "@/lib/koreanArticleDisplay";
import type { HomeArticleCard, HomePageSections } from "@/lib/home/types";

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function buildArticleSearchHaystack(
  article: HomeArticleCard,
  locale: ArticleLocale,
  bodyText?: string | null
): string {
  const parts = [
    article.title,
    article.summary,
    article.title_original,
    article.title_ko,
    article.title_translated,
    article.summary_original,
    article.summary_ko,
    article.summary_translated,
    bodyText,
    getSourceLabel(article.source, article.original_url),
    article.source,
    article.category,
    getCategoryLabel(article.category, locale),
    article.topic_label,
  ];
  return parts
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

export function articleMatchesSearch(
  article: HomeArticleCard,
  query: string,
  locale: ArticleLocale
): boolean {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return true;

  const haystack =
    article.searchHaystack ?? buildArticleSearchHaystack(article, locale);
  return haystack.includes(normalized);
}

function localePriorityScore(
  article: HomeArticleCard,
  locale: ArticleLocale
): number {
  if (article.locale === locale) return 3;
  const region = getArticleRegion(article);
  if (locale === "ko" && region === "kr") return 2;
  if (locale === "en" && region === "us") return 2;
  return 0;
}

export function sortSearchResults(
  articles: HomeArticleCard[],
  locale: ArticleLocale
): HomeArticleCard[] {
  return [...articles].sort((a, b) => {
    const priorityDiff =
      localePriorityScore(b, locale) - localePriorityScore(a, locale);
    if (priorityDiff !== 0) return priorityDiff;
    return getPublishedTimestamp(b) - getPublishedTimestamp(a);
  });
}

export function filterArticlesForSearch(
  articles: HomeArticleCard[],
  query: string,
  locale: ArticleLocale
): HomeArticleCard[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [];

  const seen = new Set<string>();
  const matched: HomeArticleCard[] = [];

  for (const article of articles) {
    if (!articleMatchesSearch(article, normalized, locale)) continue;
    const key = article.article_id ?? article.id;
    if (seen.has(key)) continue;
    seen.add(key);
    matched.push(article);
  }

  return sortSearchResults(matched, locale);
}

function filterList(
  articles: HomeArticleCard[],
  query: string,
  locale: ArticleLocale
): HomeArticleCard[] {
  return articles.filter((article) => articleMatchesSearch(article, query, locale));
}

export function filterHomePageSections(
  sections: HomePageSections,
  query: string,
  locale: ArticleLocale
): HomePageSections {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return sections;

  const featured =
    sections.featured && articleMatchesSearch(sections.featured, normalized, locale)
      ? sections.featured
      : null;

  const topStories = sections.topStories
    ? {
        ...sections.topStories,
        left: filterList(sections.topStories.left, normalized, locale),
        right: filterList(sections.topStories.right, normalized, locale),
      }
    : null;

  const groupedByCategory: Record<string, HomeArticleCard[]> = {};
  for (const [category, items] of Object.entries(sections.groupedByCategory)) {
    const filtered = filterList(items, normalized, locale);
    if (filtered.length > 0) groupedByCategory[category] = filtered;
  }

  const visibleCategories = sections.visibleCategories.filter(
    (category) => groupedByCategory[category]?.length
  );

  const sourceLeadCards = sections.sourceLeadCards.filter((item) =>
    articleMatchesSearch(item.article, normalized, locale)
  );

  const activeSourceLabels = sections.activeSourceLabels.filter((label) =>
    sourceLeadCards.some((item) => item.label === label)
  );

  return {
    ...sections,
    featured,
    featuredLeads: sections.featuredLeads
      ? filterList(sections.featuredLeads, normalized, locale)
      : undefined,
    featuredRelated: sections.featuredRelated
      ? filterList(sections.featuredRelated, normalized, locale)
      : undefined,
    latest: filterList(sections.latest, normalized, locale),
    topStories,
    sidebar: filterList(sections.sidebar, normalized, locale),
    previousHighlights: sections.previousHighlights
      ? filterList(sections.previousHighlights, normalized, locale)
      : undefined,
    groupedByCategory,
    visibleCategories,
    sourceLeadCards,
    activeSourceLabels,
  };
}

export function dedupeHomeArticles(
  articles: HomeArticleCard[]
): HomeArticleCard[] {
  const seen = new Set<string>();
  const out: HomeArticleCard[] = [];
  for (const article of articles) {
    const key = article.article_id ?? article.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }
  return out;
}
