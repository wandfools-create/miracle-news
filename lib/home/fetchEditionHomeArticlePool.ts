import type { ArticlesContentFields } from "@/lib/article/resolveLocaleContent";
import { buildArticleSearchHaystack } from "@/lib/home/articleSearch";
import {
  HOME_PUBLISHED_FETCH_LIMIT,
  type PublishedArticlesFetchOptions,
} from "@/lib/home/publishedFetchLimits";
import {
  formatServerListDate,
  formatServerPublishedFull,
} from "@/lib/home/serverDateLabels";
import { supabase } from "@/lib/supabase";
import type { EditionHomeMergeEntry } from "./buildEditionHomeCard";
import {
  selectHomePublishedArticleIds,
  type HomePublishedArticleSortRow,
} from "./homePublishedArticleSort";

/** Safe batch size for PostgREST `.in("article_id", …)` hydration. */
export const HOME_ARTICLE_ID_IN_CHUNK_SIZE = 100;

const ARTICLE_CONTENT_FIELDS = `
        language_original,
        title_original,
        title_ko,
        title_translated,
        summary_original,
        summary_ko,
        summary_translated,
`;

type ArticleMeta = ArticlesContentFields & {
  language_original?: string | null;
  is_top_story?: boolean | null;
  is_featured?: boolean | null;
  top_story_order?: number | null;
  source: string;
  source_country: string | null;
  category: string | null;
  published_at: string | null;
  source_published_at?: string | null;
  editorial_priority?: string | null;
  editorial_priority_manual?: boolean | null;
  thumbnail_url: string | null;
  original_url: string | null;
  topic_key: string | null;
  topic_label: string | null;
  body_original?: string | null;
  body_translated?: string | null;
};

export type HomePublishedLocalizationRow = {
  id: string;
  article_id: string;
  locale: "ko" | "en";
  title: string;
  summary: string | null;
  body?: string | null;
  slug: string;
  created_at: string;
  articles: ArticleMeta | ArticleMeta[] | null;
};

function getArticleMeta(row: HomePublishedLocalizationRow): ArticleMeta | null {
  if (!row.articles) return null;
  if (Array.isArray(row.articles)) return row.articles[0] ?? null;
  return row.articles;
}

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export async function fetchHomePublishedArticleIds(
  limit: number = HOME_PUBLISHED_FETCH_LIMIT
): Promise<{ articleIds: string[]; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from("articles")
    .select("id, source_published_at, published_at")
    .eq("review_status", "approved")
    .eq("is_published", true)
    .eq("status", "published")
    .order("source_published_at", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    return { articleIds: [], error: { message: error.message } };
  }

  const rows = (data ?? []) as HomePublishedArticleSortRow[];
  return {
    articleIds: selectHomePublishedArticleIds(rows, limit),
    error: null,
  };
}

export async function fetchHomePublishedLocalizations(
  articleIds: string[],
  options?: Pick<PublishedArticlesFetchOptions, "includeBody">
): Promise<{
  rows: HomePublishedLocalizationRow[];
  error: { message: string } | null;
}> {
  if (articleIds.length === 0) {
    return { rows: [], error: null };
  }

  const includeBody = options?.includeBody !== false;
  const localizationFields = includeBody
    ? "id, article_id, locale, title, summary, body, slug, created_at"
    : "id, article_id, locale, title, summary, slug, created_at";

  const rows: HomePublishedLocalizationRow[] = [];
  const chunks = chunkIds(articleIds, HOME_ARTICLE_ID_IN_CHUNK_SIZE);

  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from("article_localizations")
      .select(
        `
        ${localizationFields},
        articles!inner (
          ${ARTICLE_CONTENT_FIELDS}
          is_top_story,
          is_featured,
          top_story_order,
          source,
          source_country,
          category,
          published_at,
          source_published_at,
          editorial_priority,
          editorial_priority_manual,
          thumbnail_url,
          original_url,
          topic_key,
          topic_label,
          body_original,
          body_translated
        )
      `
      )
      .in("article_id", chunk)
      .in("locale", ["ko", "en"]);

    if (error) {
      return { rows: [], error: { message: error.message } };
    }

    rows.push(...((data ?? []) as unknown as HomePublishedLocalizationRow[]));
  }

  return { rows, error: null };
}

function mapLocalizationToMergeSlice(
  row: HomePublishedLocalizationRow,
  includeBody: boolean
): NonNullable<EditionHomeMergeEntry["ko"]> | null {
  const meta = getArticleMeta(row);
  if (!meta) return null;

  const contentFields: ArticlesContentFields = {
    language_original: meta.language_original,
    title_original: meta.title_original,
    title_ko: meta.title_ko,
    title_translated: meta.title_translated,
    summary_original: meta.summary_original,
    summary_ko: meta.summary_ko,
    summary_translated: meta.summary_translated,
  };

  const timestamp =
    meta.source_published_at ?? meta.published_at ?? row.created_at;
  const searchLocale = row.locale;

  return {
    id: row.id,
    slug: row.slug,
    created_at: row.created_at,
    is_top_story: (meta.is_top_story ?? meta.is_featured) === true,
    top_story_order: meta.top_story_order ?? 0,
    title: row.title,
    summary: row.summary,
    contentFields,
    source: meta.source,
    source_country: meta.source_country ?? null,
    category: meta.category,
    published_at: meta.published_at,
    source_published_at: meta.source_published_at ?? null,
    editorial_priority: meta.editorial_priority ?? "normal",
    editorial_priority_manual: meta.editorial_priority_manual === true,
    listDateKo: formatServerListDate(timestamp, "ko"),
    listDateEn: formatServerListDate(timestamp, "en"),
    publishedFullKo: formatServerPublishedFull(timestamp, "ko"),
    publishedFullEn: formatServerPublishedFull(timestamp, "en"),
    searchHaystack: buildArticleSearchHaystack(
      {
        id: row.id,
        title: row.title,
        summary: row.summary,
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
      searchLocale,
      includeBody ? (row.body ?? "") : ""
    ),
    thumbnail_url: meta.thumbnail_url,
    title_original: meta.title_original,
    original_url: meta.original_url ?? null,
    topic_key: meta.topic_key ?? null,
    topic_label: meta.topic_label ?? null,
  };
}

/** Merge hydrated localization rows into edition entries keyed by article_id. */
export function mergeEditionHomeEntriesFromLocalizations(
  rows: HomePublishedLocalizationRow[],
  options?: { includeBody?: boolean }
): Map<string, EditionHomeMergeEntry> {
  const includeBody = options?.includeBody !== false;
  const byArticleId = new Map<string, EditionHomeMergeEntry>();

  for (const row of rows) {
    const slice = mapLocalizationToMergeSlice(row, includeBody);
    if (!slice) continue;

    const articleId = row.article_id;
    const existing = byArticleId.get(articleId) ?? { article_id: articleId };
    if (row.locale === "ko") {
      existing.ko = slice;
    } else if (row.locale === "en") {
      existing.en = slice;
    }
    byArticleId.set(articleId, existing);
  }

  return byArticleId;
}

export type FetchEditionHomeArticlePoolResult = {
  articleIds: string[];
  entries: Map<string, EditionHomeMergeEntry>;
  error: { message: string } | null;
};

/** Shared home pool: one article-id selection, then KO+EN localization hydration. */
export async function fetchEditionHomeArticlePool(
  options?: Pick<PublishedArticlesFetchOptions, "limit" | "includeBody">
): Promise<FetchEditionHomeArticlePoolResult> {
  const limit = options?.limit ?? HOME_PUBLISHED_FETCH_LIMIT;
  const includeBody = options?.includeBody !== false;

  const { articleIds, error: idError } = await fetchHomePublishedArticleIds(limit);
  if (idError) {
    return { articleIds: [], entries: new Map(), error: idError };
  }

  const { rows, error: locError } = await fetchHomePublishedLocalizations(
    articleIds,
    { includeBody }
  );
  if (locError) {
    return { articleIds: [], entries: new Map(), error: locError };
  }

  return {
    articleIds,
    entries: mergeEditionHomeEntriesFromLocalizations(rows, { includeBody }),
    error: null,
  };
}
