import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleDetailView from "@/components/article/ArticleDetailView";
import { generatePublishedArticleMetadata } from "@/lib/seo/articlePageMetadata";
import type {
  ArticleDetailData,
  RelatedArticleCard,
} from "@/components/article/types";
import { enArticleDetailLabels } from "@/lib/article/enLabels";
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
  return generatePublishedArticleMetadata("en", slug);
}

export default async function EnglishArticleDetailPage({ params }: PageProps) {
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
    .eq("locale", "en")
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
    "en",
    localization,
    articleMeta
  );

  const { data: koreanVersion } = await supabase
    .from("article_localizations")
    .select("slug")
    .eq("article_id", article.article_id)
    .eq("locale", "ko")
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
      .eq("locale", "en")
      .eq("articles.topic_key", article.topic_key)
      .eq("articles.review_status", "approved")
      .eq("articles.is_published", true)
      .eq("articles.status", "published")
      .neq("article_id", article.article_id)
      .limit(6);

    sameTopicArticles = toRelatedArticles(
      (topicRows as RelatedArticleRow[] | null) ?? [],
      "en"
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
      .eq("locale", "en")
      .eq("articles.category", article.category)
      .eq("articles.review_status", "approved")
      .eq("articles.is_published", true)
      .eq("articles.status", "published")
      .neq("article_id", article.article_id)
      .limit(10);

    const rawCategoryArticles = toRelatedArticles(
      (categoryRows as RelatedArticleRow[] | null) ?? [],
      "en"
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
      locale="en"
      labels={enArticleDetailLabels}
      homeHref="/en"
      articleHrefPrefix="/en/article"
      sourceFilterHref={buildHomeSourceFilterHref("en", articleMeta.source)}
      categoryFilterHref={
        articleMeta.category
          ? buildHomeCategoryFilterHref("en", articleMeta.category)
          : null
      }
      alternateVersionHref={
        koreanVersion?.slug ? `/ko/article/${koreanVersion.slug}` : null
      }
      sameTopicArticles={sameTopicArticles}
      sameCategoryArticles={sameCategoryArticles}
    />
  );
}
