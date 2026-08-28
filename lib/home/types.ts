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
  /** 한눈 사이트 공개 시각 */
  published_at: string | null;
  /** 원문/RSS 발행 시각 — editorial freshness fallback after published_at */
  source_published_at?: string | null;
  /** normal | issue | special | breaking — site-publish window boost when not manual */
  editorial_priority?: string | null;
  /** When true, editorial_priority is human-locked and outranks AI grade. */
  editorial_priority_manual?: boolean;
  /** Snapshot / joined candidate AI grade (best|priority|normal|low). */
  ai_recommend_grade?: string | null;
  /** Snapshot / joined candidate AI score 0–100. */
  ai_recommend_score?: number | null;
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

/**
 * Published home-card fields carried with a trending issue so the UI can link
 * without client-side text matching. Built only from the same article pool.
 */
export type TrendingIssueRelatedArticle = {
  id: string;
  article_id?: string;
  slug: string;
  title: string;
  source: string;
  original_url?: string | null;
};

export type TrendingIssue = {
  id: string;
  title: string;
  description: string | null;
  region: "us" | "kr";
  /** Lead published article used to form title/description (may be null if none). */
  primaryArticle: TrendingIssueRelatedArticle | null;
  /** Up to 3 related published articles from the same topic/category bucket. */
  relatedArticles: TrendingIssueRelatedArticle[];
  /** Site publish >24h but ≤48h and topic/event still active. */
  continuingIssue?: boolean;
};

export type TodayEditionStatus = "ready" | "preparing";

export type TodayEditionMeta = {
  editionDateKey: string;
  todayCount: number;
  lastUpdatedAt: string | null;
  status: TodayEditionStatus;
  headerDateKo: string;
  headerDateEn: string;
  editionTitleKo: string;
  editionTitleEn: string;
  statusLineKo: string;
  statusLineEn: string;
  preparingMessageKo: string;
  preparingMessageEn: string;
  preparingPhaseKo: string;
  preparingPhaseEn: string;
};

export type TrendingIssuesBlock = {
  us: TrendingIssue[];
  kr: TrendingIssue[];
};

export type HomePageSections = {
  featured: HomeArticleCard | null;
  /** Featured combo leads (hero + optional secondary). */
  featuredLeads?: HomeArticleCard[];
  /** Numbered 「주요 기사」 under the hero (excludes featured). */
  featuredRelated?: HomeArticleCard[];
  latest: HomeArticleCard[];
  /** When set, replaces single latest list with regional two-column layout. */
  topStories?: EditionTopStoriesColumns | null;
  trendingIssues?: TrendingIssuesBlock | null;
  sidebar: HomeArticleCard[];
  /** 지난 주요뉴스 — 2–7 NY days, separate from today hero. */
  previousHighlights?: HomeArticleCard[];
  todayEdition?: TodayEditionMeta;
  groupedByCategory: Record<string, HomeArticleCard[]>;
  visibleCategories: string[];
  sourceLeadCards: SourceLeadCard[];
  activeSourceLabels: string[];
};
