export type ArticleEditionLocale = "ko" | "en";

/** Card shape shared by home pages (matches published localization rows). */
export type HomeArticleCard = {
  id: string;
  /** Parent articles.id — used to dedupe KO/EN localizations. */
  article_id?: string;
  /** Admin manual top-story pin flag. */
  is_top_story?: boolean;
  /** Smaller number means higher priority among pinned stories. */
  top_story_order?: number | null;
  title: string;
  summary: string | null;
  slug: string;
  created_at: string;
  source: string;
  /** articles.source_country — US, KR, etc. */
  source_country?: string | null;
  category: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  title_original: string;
  /** articles.original_url — used on main hub for YouTube/SNS grouping. */
  original_url?: string | null;
  /** Set when merging KO+EN on the main hub (/) only. */
  locale?: ArticleEditionLocale;
  /** Preformatted date labels from server to avoid hydration mismatch. */
  listDateKo?: string;
  listDateEn?: string;
  publishedFullKo?: string;
  publishedFullEn?: string;
  /** Lowercased text for client/server search (title, summary, body, source, category). */
  searchHaystack?: string;
  /** Present on published fetch rows — used for edition-page locale resolution. */
  language_original?: string | null;
  title_ko?: string | null;
  title_translated?: string | null;
  summary_original?: string | null;
  summary_ko?: string | null;
  summary_translated?: string | null;
  topic_key?: string | null;
  topic_label?: string | null;
};

export type SourceLeadCard = {
  key: string;
  label: string;
  description: string;
  article: HomeArticleCard;
};

export type EditionTopStoriesColumns = {
  leftTitle: string;
  rightTitle: string;
  left: HomeArticleCard[];
  right: HomeArticleCard[];
};

export type TrendingIssue = {
  id: string;
  title: string;
  description: string | null;
  region: "us" | "kr";
};

export type TrendingIssuesBlock = {
  us: TrendingIssue[];
  kr: TrendingIssue[];
};

export type HomePageSections = {
  featured: HomeArticleCard | null;
  latest: HomeArticleCard[];
  /** When set, replaces single latest list with regional two-column layout. */
  topStories?: EditionTopStoriesColumns | null;
  trendingIssues?: TrendingIssuesBlock | null;
  sidebar: HomeArticleCard[];
  groupedByCategory: Record<string, HomeArticleCard[]>;
  visibleCategories: string[];
  sourceLeadCards: SourceLeadCard[];
  activeSourceLabels: string[];
};
