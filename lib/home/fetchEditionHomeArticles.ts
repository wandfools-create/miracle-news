import {
  type ArticlesContentFields,
} from "@/lib/article/resolveLocaleContent";
import { fetchEnglishPublishedArticles } from "@/lib/englishPublishedArticles";
import { fetchKoreanPublishedArticles } from "@/lib/koreanPublishedArticles";
import {
  buildEditionHomeCard,
  type EditionHomeMergeEntry,
} from "./buildEditionHomeCard";
import { enrichHomeArticlesWithCandidateGrades } from "./enrichHomeArticlesWithCandidateGrades";
import type { ArticleEditionLocale, HomeArticleCard } from "./types";

type EditionMergeEntry = EditionHomeMergeEntry;

/** Merged KO+EN published pool with copy resolved for the edition page locale. */
export async function fetchEditionHomeArticles(
  displayLocale: ArticleEditionLocale
): Promise<{
  articles: HomeArticleCard[];
  error: { message: string } | null;
}> {
  const [koResult, enResult] = await Promise.all([
    fetchKoreanPublishedArticles({ includeBody: false }),
    fetchEnglishPublishedArticles({ includeBody: false }),
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
        editorial_priority_manual: row.editorial_priority_manual === true,
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
        editorial_priority_manual: row.editorial_priority_manual === true,
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
    const card = buildEditionHomeCard(displayLocale, entry);
    if (card) articles.push(card);
  }

  const enriched = await enrichHomeArticlesWithCandidateGrades(articles);

  return {
    articles: enriched,
    error: koResult.error ?? enResult.error ?? null,
  };
}
