import {
  resolveBodyForLocale,
  resolveSummaryForLocale,
  resolveTitleForLocale,
  type ArticlesContentFields,
} from "@/lib/article/resolveLocaleContent";
import { buildArticleSearchHaystack } from "@/lib/home/articleSearch";
import {
  formatServerListDate,
  formatServerPublishedFull,
} from "@/lib/home/serverDateLabels";
import { supabase } from "./supabase";
import type { HomeArticleCard } from "./home/types";

type ArticleMeta = ArticlesContentFields & {
  language_original?: string | null;
  is_top_story?: boolean | null;
  is_featured?: boolean | null;
  top_story_order?: number | null;
  source: string;
  source_country: string | null;
  category: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  original_url: string | null;
  topic_key: string | null;
  topic_label: string | null;
};

const ARTICLE_CONTENT_FIELDS = `
        language_original,
        title_original,
        title_ko,
        title_translated,
        summary_original,
        summary_ko,
        summary_translated,
`;

type EnglishArticleRow = {
  id: string;
  article_id: string;
  title: string;
  summary: string | null;
  body: string | null;
  slug: string;
  created_at: string;
  articles: ArticleMeta | ArticleMeta[] | null;
};

function getArticleMeta(row: EnglishArticleRow): ArticleMeta | null {
  if (!row.articles) return null;
  if (Array.isArray(row.articles)) return row.articles[0] ?? null;
  return row.articles;
}

// TODO: select articles.view_count when the column is added to the DB.
export async function fetchEnglishPublishedArticles() {
  const { data, error } = await supabase
    .from("article_localizations")
    .select(
      `
      id,
      article_id,
      title,
      summary,
      body,
      slug,
      created_at,
      articles!inner (*)
    `
    )
    .eq("locale", "en")
    .eq("articles.review_status", "approved")
    .eq("articles.is_published", true)
    .eq("articles.status", "published");

  const rawArticles = (data ?? []) as unknown as EnglishArticleRow[];
  const articles: HomeArticleCard[] = [];

  for (const row of rawArticles) {
    const meta = getArticleMeta(row);
    if (!meta) continue;

    const contentFields: ArticlesContentFields = {
      language_original: meta.language_original,
      title_original: meta.title_original,
      title_ko: meta.title_ko,
      title_translated: meta.title_translated,
      summary_original: meta.summary_original,
      summary_ko: meta.summary_ko,
      summary_translated: meta.summary_translated,
      body_original: meta.body_original,
      body_translated: meta.body_translated,
    };

    const title = resolveTitleForLocale("en", contentFields, { title: row.title });
    const summary = resolveSummaryForLocale("en", contentFields, {
      summary: row.summary,
    });
    const body = resolveBodyForLocale("en", contentFields, { body: row.body });

    articles.push({
      id: row.id,
      article_id: row.article_id,
      title,
      summary,
      slug: row.slug,
      created_at: row.created_at,
      source: meta.source,
      is_top_story: (meta.is_top_story ?? meta.is_featured) === true,
      top_story_order: meta.top_story_order ?? 0,
      source_country: meta.source_country,
      category: meta.category,
      published_at: meta.published_at,
      thumbnail_url: meta.thumbnail_url,
      title_original: meta.title_original,
      original_url: meta.original_url,
      language_original: meta.language_original,
      title_ko: meta.title_ko,
      title_translated: meta.title_translated,
      summary_original: meta.summary_original,
      summary_ko: meta.summary_ko,
      summary_translated: meta.summary_translated,
      topic_key: meta.topic_key,
      topic_label: meta.topic_label,
      listDateKo: formatServerListDate(meta.published_at ?? row.created_at, "ko"),
      listDateEn: formatServerListDate(meta.published_at ?? row.created_at, "en"),
      publishedFullKo: formatServerPublishedFull(
        meta.published_at ?? row.created_at,
        "ko"
      ),
      publishedFullEn: formatServerPublishedFull(
        meta.published_at ?? row.created_at,
        "en"
      ),
      searchHaystack: buildArticleSearchHaystack(
        {
          id: row.id,
          title,
          summary,
          slug: row.slug,
          created_at: row.created_at,
          source: meta.source,
          category: meta.category,
          published_at: meta.published_at,
          thumbnail_url: meta.thumbnail_url,
          title_original: meta.title_original,
          original_url: meta.original_url,
          title_ko: meta.title_ko,
          title_translated: meta.title_translated,
          summary_original: meta.summary_original,
          summary_ko: meta.summary_ko,
          summary_translated: meta.summary_translated,
        },
        "en",
        body
      ),
    });
  }

  return { articles, error };
}
