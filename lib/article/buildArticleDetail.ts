import type { ArticleDetailData } from "@/components/article/types";
import {
  resolveBodyForLocale,
  resolveOriginalTitleForDisplay,
  resolveSummaryForLocale,
  resolveTitleForLocale,
  type ArticlesContentFields,
  type LocalizationContentFields,
} from "./resolveLocaleContent";

type ArticleMetaRow = ArticlesContentFields & {
  source: string;
  category: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  original_url: string;
  topic_key: string | null;
  topic_label: string | null;
};

export function buildArticleDetailForLocale(
  locale: "ko" | "en",
  localization: {
    id: string;
    article_id: string;
    locale: string;
    slug: string;
    meta_description: string | null;
  } & LocalizationContentFields,
  articleMeta: ArticleMetaRow
): ArticleDetailData {
  const contentFields: ArticlesContentFields = {
    language_original: articleMeta.language_original,
    title_original: articleMeta.title_original,
    title_ko: articleMeta.title_ko,
    title_translated: articleMeta.title_translated,
    summary_original: articleMeta.summary_original,
    summary_ko: articleMeta.summary_ko,
    summary_translated: articleMeta.summary_translated,
    body_original: articleMeta.body_original,
    body_translated: articleMeta.body_translated,
  };

  const locFields: LocalizationContentFields = {
    title: localization.title,
    summary: localization.summary,
    body: localization.body,
  };

  const title = resolveTitleForLocale(locale, contentFields, locFields);
  const summary = resolveSummaryForLocale(locale, contentFields, locFields);
  const body = resolveBodyForLocale(locale, contentFields, locFields);
  const originalTitleLine = resolveOriginalTitleForDisplay(
    locale,
    contentFields,
    title
  );

  return {
    id: localization.id,
    article_id: localization.article_id,
    locale: localization.locale,
    title,
    body,
    summary,
    slug: localization.slug,
    meta_description: localization.meta_description,
    source: articleMeta.source,
    category: articleMeta.category,
    published_at: articleMeta.published_at,
    thumbnail_url: articleMeta.thumbnail_url,
    original_url: articleMeta.original_url,
    title_original: originalTitleLine ?? articleMeta.title_original,
    topic_key: articleMeta.topic_key,
    topic_label: articleMeta.topic_label,
  };
}
