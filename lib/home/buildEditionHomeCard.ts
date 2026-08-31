import {
  resolveSummaryForLocale,
  resolveTitleForLocale,
  type ArticlesContentFields,
} from "@/lib/article/resolveLocaleContent";
import type { ArticleEditionLocale, HomeArticleCard } from "./types";

export type EditionHomeMergeEntry = {
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
    editorial_priority_manual?: boolean;
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
  en?: EditionHomeMergeEntry["ko"];
};

/** Pairs locale with the primary localization row for home cards. */
export function buildEditionHomeCard(
  displayLocale: ArticleEditionLocale,
  entry: EditionHomeMergeEntry
): HomeArticleCard | null {
  let primary: NonNullable<EditionHomeMergeEntry["ko"]>;
  let hrefLocale: ArticleEditionLocale;

  if (displayLocale === "ko") {
    if (entry.ko) {
      primary = entry.ko;
      hrefLocale = "ko";
    } else if (entry.en) {
      primary = entry.en;
      hrefLocale = "en";
    } else {
      return null;
    }
  } else if (entry.en) {
    primary = entry.en;
    hrefLocale = "en";
  } else if (entry.ko) {
    primary = entry.ko;
    hrefLocale = "ko";
  } else {
    return null;
  }

  const loc = { title: primary.title, summary: primary.summary };

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
    editorial_priority_manual: primary.editorial_priority_manual === true,
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
