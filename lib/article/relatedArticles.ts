import type { ArticleLocale } from "./formatPublishedDate";
import { getArticleTimestamp } from "./formatPublishedDate";
import {
  resolveTitleForLocale,
  type ArticlesContentFields,
} from "./resolveLocaleContent";
import type { RelatedArticleCard } from "@/components/article/types";

export type RelatedArticleRow = {
  id: string;
  article_id: string;
  title: string;
  summary: string | null;
  slug: string;
  articles:
    | (ArticlesContentFields & {
        source: string;
        original_url: string | null;
        category: string | null;
        published_at: string | null;
        thumbnail_url: string | null;
        topic_label: string | null;
      })
    | (ArticlesContentFields & {
        source: string;
        original_url: string | null;
        category: string | null;
        published_at: string | null;
        thumbnail_url: string | null;
        topic_label: string | null;
      })[]
    | null;
};

function getRelatedMeta(row: RelatedArticleRow) {
  if (!row.articles) return null;
  if (Array.isArray(row.articles)) return row.articles[0] ?? null;
  return row.articles;
}

export function toRelatedArticles(
  rows: RelatedArticleRow[] | null | undefined,
  locale: ArticleLocale
): RelatedArticleCard[] {
  const list: RelatedArticleCard[] = [];

  for (const row of rows ?? []) {
    const meta = getRelatedMeta(row);
    if (!meta) continue;

    const contentFields: ArticlesContentFields = {
      language_original: meta.language_original,
      title_original: meta.title_original,
      title_ko: meta.title_ko,
      title_translated: meta.title_translated,
    };

    list.push({
      id: row.id,
      article_id: row.article_id,
      title: resolveTitleForLocale(locale, contentFields, { title: row.title }),
      summary: row.summary,
      slug: row.slug,
      source: meta.source,
      original_url: meta.original_url,
      category: meta.category,
      published_at: meta.published_at,
      thumbnail_url: meta.thumbnail_url,
      topic_label: meta.topic_label,
    });
  }

  list.sort(
    (a, b) =>
      getArticleTimestamp(b.published_at) - getArticleTimestamp(a.published_at)
  );
  return list;
}
