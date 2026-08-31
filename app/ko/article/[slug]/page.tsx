import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleDetailView from "@/components/article/ArticleDetailView";
import { generatePublishedArticleMetadata } from "@/lib/seo/articlePageMetadata";
import type {
  ArticleDetailData,
  RelatedArticleCard,
} from "@/components/article/types";
import { koArticleDetailLabels } from "@/lib/article/koLabels";
import {
  toRelatedArticles,
  type RelatedArticleRow,
} from "@/lib/article/relatedArticles";
import { buildArticleDetailForLocale } from "@/lib/article/buildArticleDetail";
import {
  buildHomeCategoryFilterHref,
  buildHomeSourceFilterHref,
} from "@/lib/home/buildHomeFilterHref";
import { splitArticleParagraphs } from "@/lib/article/splitParagraphs";
import { supabase } from "../../../../lib/supabase";

const ARTICLE_META_SELECT = `
      id,
      source,
      category,
      published_at,
      thumbnail_url,
      original_url,
      language_original,
      title_original,
      title_ko,
      title_translated,
      summary_original,
      summary_ko,
      summary_translated,
      body_original,
      body_translated,
      topic_key,
      topic_label,
      review_status,
      is_published,
      status
`;

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return generatePublishedArticleMetadata("ko", slug);
}

export default async function KoreanArticleDetailPage({ params }: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const { data: localization, error: localizationError } = await supabase
    .from("article_localizations")
    .select(`
      id,
      article_id,
      locale,
      title,
      body,
      summary,
      slug,
      meta_description,
      created_at
    `)
    .eq("locale", "ko")
    .eq("slug", slug)
    .maybeSingle();

  if (localizationError || !localization) {
    notFound();
  }

  const { data: articleMeta, error: articleMetaError } = await supabase
    .from("articles")
    .select(ARTICLE_META_SELECT)
    .eq("id", localization.article_id)
    .eq("review_status", "approved")
    .eq("is_published", true)
    .eq("status", "published")
    .maybeSingle();

  if (articleMetaError || !articleMeta) {
    notFound();
  }

  const article: ArticleDetailData = buildArticleDetailForLocale(
    "ko",
    localization,
    articleMeta
  );

  const { data: englishVersion } = await supabase
    .from("article_localizations")
    .select("slug")
    .eq("article_id", article.article_id)
    .eq("locale", "en")
    .maybeSingle();

  let sameTopicArticles: RelatedArticleCard[] = [];

  if (article.topic_key) {
    const { data: topicRows } = await supabase
      .from("article_localizations")
      .select(`
        id,
        article_id,
        title,
        summary,
        slug,
        articles!inner (
          source,
          original_url,
          language_original,
          title_original,
          title_ko,
          title_translated,
          category,
          published_at,
          thumbnail_url,
          topic_label
        )
      `)
      .eq("locale", "ko")
      .eq("articles.topic_key", article.topic_key)
      .eq("articles.review_status", "approved")
      .eq("articles.is_published", true)
      .eq("articles.status", "published")
      .neq("article_id", article.article_id)
      .limit(6);

    sameTopicArticles = toRelatedArticles(
      (topicRows as RelatedArticleRow[] | null) ?? [],
      "ko"
    ).slice(0, 4);
  }

  let sameCategoryArticles: RelatedArticleCard[] = [];

  if (article.category) {
    const { data: categoryRows } = await supabase
      .from("article_localizations")
      .select(`
        id,
        article_id,
        title,
        summary,
        slug,
        articles!inner (
          source,
          original_url,
          language_original,
          title_original,
          title_ko,
          title_translated,
          category,
          published_at,
          thumbnail_url,
          topic_label
        )
      `)
      .eq("locale", "ko")
      .eq("articles.category", article.category)
      .eq("articles.review_status", "approved")
      .eq("articles.is_published", true)
      .eq("articles.status", "published")
      .neq("article_id", article.article_id)
      .limit(10);

    const rawCategoryArticles = toRelatedArticles(
      (categoryRows as RelatedArticleRow[] | null) ?? [],
      "ko"
    );

    const topicIds = new Set(sameTopicArticles.map((item) => item.article_id));

    sameCategoryArticles = rawCategoryArticles
      .filter((item) => !topicIds.has(item.article_id))
      .slice(0, 4);
  }

  const paragraphs = splitArticleParagraphs(article.body);

  return (
    <ArticleDetailView
      article={article}
      paragraphs={paragraphs}
      locale="ko"
      labels={koArticleDetailLabels}
      homeHref="/ko"
      articleHrefPrefix="/ko/article"
      sourceFilterHref={buildHomeSourceFilterHref("ko", articleMeta.source)}
      categoryFilterHref={
        articleMeta.category
          ? buildHomeCategoryFilterHref("ko", articleMeta.category)
          : null
      }
      alternateVersionHref={
        englishVersion?.slug
          ? `/en/article/${englishVersion.slug}`
          : null
      }
      sameTopicArticles={sameTopicArticles}
      sameCategoryArticles={sameCategoryArticles}
    />
  );
}
