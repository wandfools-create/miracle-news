import {
  resolveSummaryForLocale,
  resolveTitleForLocale,
  type ArticlesContentFields,
} from "@/lib/article/resolveLocaleContent";
import { fetchEnglishPublishedArticles } from "@/lib/englishPublishedArticles";
import { fetchKoreanPublishedArticles } from "@/lib/koreanPublishedArticles";
import type { ArticleEditionLocale, HomeArticleCard } from "./types";

type EditionMergeEntry = {
  article_id: string;
  ko?: {
    id: string;
    slug: string;
    created_at: string;
    is_top_story: boolean;
    top_story_order: number;
    title: string;
    summary: string | null;
    contentFields: ArticlesContentFields;
    source: string;
    source_country: string | null;
    category: string | null;
    published_at: string | null;
    source_published_at: string | null;
    editorial_priority: string | null;
    listDateKo?: string;
    listDateEn?: string;
    publishedFullKo?: string;
    publishedFullEn?: string;
    searchHaystack?: string;
    thumbnail_url: string | null;
    title_original: string;
    original_url: string | null;
    topic_key: string | null;
    topic_label: string | null;
  };
  en?: EditionMergeEntry["ko"];
};

function buildCard(
  displayLocale: ArticleEditionLocale,
  entry: EditionMergeEntry
): HomeArticleCard | null {
  const primary =
    displayLocale === "ko"
      ? entry.ko ?? entry.en
      : entry.en ?? entry.ko;
  if (!primary) return null;

  const loc = { title: primary.title, summary: primary.summary };
  const hrefLocale: ArticleEditionLocale = entry.ko
    ? "ko"
    : entry.en
      ? "en"
      : displayLocale;

  return {
    id: primary.id,
    article_id: entry.article_id,
    is_top_story: primary.is_top_story,
    top_story_order: primary.top_story_order,
    title: resolveTitleForLocale(displayLocale, primary.contentFields, loc),
    summary: resolveSummaryForLocale(displayLocale, primary.contentFields, loc),
    slug: primary.slug,
    created_at: primary.created_at,
    source: primary.source,
    source_country: primary.source_country,
    category: primary.category,
    published_at: primary.published_at,
    source_published_at: primary.source_published_at,
    editorial_priority: primary.editorial_priority,
    listDateKo: primary.listDateKo,
    listDateEn: primary.listDateEn,
    publishedFullKo: primary.publishedFullKo,
    publishedFullEn: primary.publishedFullEn,
    searchHaystack: [entry.ko?.searchHaystack, entry.en?.searchHaystack]
      .filter(Boolean)
      .join(" ") || primary.searchHaystack,
    thumbnail_url: primary.thumbnail_url,
    title_original: primary.title_original,
    original_url: primary.original_url,
    locale: hrefLocale,
    topic_key: primary.topic_key,
    topic_label: primary.topic_label,
  };
}

/** Merged KO+EN published pool with copy resolved for the edition page locale. */
export async function fetchEditionHomeArticles(
  displayLocale: ArticleEditionLocale
): Promise<{
  articles: HomeArticleCard[];
  error: { message: string } | null;
}> {
  const [koResult, enResult] = await Promise.all([
    fetchKoreanPublishedArticles(),
    fetchEnglishPublishedArticles(),
  ]);

  const byArticleId = new Map<string, EditionMergeEntry>();

  for (const row of koResult.articles) {
    const articleId = row.article_id ?? row.id;
    const contentFields: ArticlesContentFields = {
      language_original: row.language_original,
      title_original: row.title_original,
      title_ko: row.title_ko,
      title_translated: row.title_translated,
      summary_original: row.summary_original,
      summary_ko: row.summary_ko,
      summary_translated: row.summary_translated,
    };
    byArticleId.set(articleId, {
      article_id: articleId,
      ko: {
        id: row.id,
        slug: row.slug,
        created_at: row.created_at,
        is_top_story: row.is_top_story ?? false,
        top_story_order: row.top_story_order ?? 0,
        title: row.title,
        summary: row.summary,
        contentFields,
        source: row.source,
        source_country: row.source_country ?? null,
        category: row.category,
        published_at: row.published_at,
        source_published_at: row.source_published_at ?? null,
        editorial_priority: row.editorial_priority ?? "normal",
        listDateKo: row.listDateKo,
        listDateEn: row.listDateEn,
        publishedFullKo: row.publishedFullKo,
        publishedFullEn: row.publishedFullEn,
        searchHaystack: row.searchHaystack,
        thumbnail_url: row.thumbnail_url,
        title_original: row.title_original,
        original_url: row.original_url ?? null,
        topic_key: row.topic_key ?? null,
        topic_label: row.topic_label ?? null,
      },
      en: byArticleId.get(articleId)?.en,
    });
  }

  for (const row of enResult.articles) {
    const articleId = row.article_id ?? row.id;
    const contentFields: ArticlesContentFields = {
      language_original: row.language_original,
      title_original: row.title_original,
      title_ko: row.title_ko,
      title_translated: row.title_translated,
      summary_original: row.summary_original,
      summary_ko: row.summary_ko,
      summary_translated: row.summary_translated,
    };
    const existing = byArticleId.get(articleId);
    byArticleId.set(articleId, {
      article_id: articleId,
      ko: existing?.ko,
      en: {
        id: row.id,
        slug: row.slug,
        created_at: row.created_at,
        is_top_story: row.is_top_story ?? false,
        top_story_order: row.top_story_order ?? 0,
        title: row.title,
        summary: row.summary,
        contentFields,
        source: row.source,
        source_country: row.source_country ?? null,
        category: row.category,
        published_at: row.published_at,
        source_published_at: row.source_published_at ?? null,
        editorial_priority: row.editorial_priority ?? "normal",
        listDateKo: row.listDateKo,
        listDateEn: row.listDateEn,
        publishedFullKo: row.publishedFullKo,
        publishedFullEn: row.publishedFullEn,
        searchHaystack: row.searchHaystack,
        thumbnail_url: row.thumbnail_url,
        title_original: row.title_original,
        original_url: row.original_url ?? null,
        topic_key: row.topic_key ?? null,
        topic_label: row.topic_label ?? null,
      },
    });
  }

  const articles: HomeArticleCard[] = [];
  for (const entry of byArticleId.values()) {
    const card = buildCard(displayLocale, entry);
    if (card) articles.push(card);
  }

  return {
    articles,
    error: koResult.error ?? enResult.error ?? null,
  };
}
