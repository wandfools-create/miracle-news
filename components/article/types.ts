export type ArticleDetailData = {
  id: string;
  article_id: string;
  locale: string;
  title: string;
  body: string | null;
  summary: string | null;
  slug: string;
  meta_description: string | null;
  source: string;
  category: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  original_url: string;
  title_original: string;
  topic_key: string | null;
  topic_label: string | null;
};

export type RelatedArticleCard = {
  id: string;
  article_id: string;
  title: string;
  summary: string | null;
  slug: string;
  source: string;
  original_url?: string | null;
  category: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  topic_label: string | null;
};
