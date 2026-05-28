import {
  resolveSummaryForLocale,
  resolveTitleForLocale,
  type ArticlesContentFields,
} from "@/lib/article/resolveLocaleContent";
import { supabase } from "@/lib/supabase";

const ARTICLE_META_SELECT = `
  published_at,
  thumbnail_url,
  language_original,
  title_original,
  title_ko,
  title_translated,
  summary_original,
  summary_ko,
  summary_translated,
  review_status,
  is_published,
  status
`;

export type PublishedArticleSeo = {
  title: string;
  description: string;
  slug: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
};

function pickDescription(
  metaDescription: string | null,
  summary: string | null,
  title: string
): string {
  const fromMeta = metaDescription?.trim();
  if (fromMeta) return fromMeta;
  const fromSummary = summary?.trim();
  if (fromSummary) return fromSummary;
  return title;
}

export async function fetchPublishedArticleSeo(
  locale: "ko" | "en",
  slug: string
): Promise<PublishedArticleSeo | null> {
  const { data: localization, error } = await supabase
    .from("article_localizations")
    .select(
      `
      title,
      summary,
      slug,
      meta_description,
      articles!inner (${ARTICLE_META_SELECT})
    `
    )
    .eq("locale", locale)
    .eq("slug", slug)
    .eq("articles.review_status", "approved")
    .eq("articles.is_published", true)
    .eq("articles.status", "published")
    .maybeSingle();

  if (error || !localization) return null;

  const articleRaw = localization.articles;
  const articleMeta = Array.isArray(articleRaw) ? articleRaw[0] : articleRaw;
  if (!articleMeta) return null;

  const contentFields: ArticlesContentFields = {
    language_original: articleMeta.language_original,
    title_original: articleMeta.title_original,
    title_ko: articleMeta.title_ko,
    title_translated: articleMeta.title_translated,
    summary_original: articleMeta.summary_original,
    summary_ko: articleMeta.summary_ko,
    summary_translated: articleMeta.summary_translated,
  };

  const title = resolveTitleForLocale(locale, contentFields, {
    title: localization.title,
  });
  const summary = resolveSummaryForLocale(locale, contentFields, {
    summary: localization.summary,
  });

  return {
    title,
    description: pickDescription(
      localization.meta_description,
      summary,
      title
    ),
    slug: localization.slug,
    thumbnailUrl: articleMeta.thumbnail_url ?? null,
    publishedAt: articleMeta.published_at ?? null,
  };
}

export type SitemapArticleEntry = {
  locale: "ko" | "en";
  slug: string;
  updatedAt: Date;
};

export async function fetchPublishedSitemapEntries(): Promise<
  SitemapArticleEntry[]
> {
  const { data, error } = await supabase
    .from("article_localizations")
    .select(
      `
      locale,
      slug,
      created_at,
      articles!inner (
        published_at,
        review_status,
        is_published,
        status
      )
    `
    )
    .in("locale", ["ko", "en"])
    .eq("articles.review_status", "approved")
    .eq("articles.is_published", true)
    .eq("articles.status", "published");

  if (error || !data) return [];

  const entries: SitemapArticleEntry[] = [];

  for (const row of data) {
    const articleRaw = row.articles;
    const articleMeta = Array.isArray(articleRaw) ? articleRaw[0] : articleRaw;
    if (!articleMeta || !row.slug) continue;
    if (row.locale !== "ko" && row.locale !== "en") continue;

    const dateSource =
      articleMeta.published_at ?? row.created_at ?? new Date().toISOString();
    const updatedAt = new Date(dateSource);
    if (Number.isNaN(updatedAt.getTime())) continue;

    entries.push({
      locale: row.locale,
      slug: row.slug,
      updatedAt,
    });
  }

  return entries;
}
