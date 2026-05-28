import type { FromLinkExtractionStats } from "./fromLinkDiagnostics";

export type LinkType = "article" | "youtube" | "x" | "instagram" | "video";

export type ContentLanguage = "ko" | "en" | "unknown";

export type ExtractedPreview = {
  title: string | null;
  description: string | null;
  siteName: string | null;
  thumbnailUrl: string | null;
  bodySnippet: string | null;
  /** Longer plain text from article page (for language / original body). */
  articleBodyPlain: string | null;
  /** How articleBodyPlain was extracted (readability, json-ld-articleBody, …). */
  articleBodyExtractMethod?: string | null;
  /** False when no usable article body (meta description is not counted). */
  articleBodyExtractSuccess?: boolean;
  /** How the page HTML was loaded before body extraction. */
  pageFetchMethod?: "http" | "playwright" | null;
  /** HTTP vs Playwright body probe lengths (diagnostics). */
  extractionStats?: FromLinkExtractionStats;
  /** ISO 8601 from article:published_time etc. */
  publishedAt: string | null;
  contentLanguage: ContentLanguage;
  author: string | null;
  /** Fetched/preview URL (may differ after redirects). */
  rawUrl: string;
  /** User-entered URL; used exclusively for original_url and “원문 보기”. */
  submittedOriginalUrl: string;
  extractNote: string | null;
  /** Full YouTube caption transcript when available. */
  youtubeTranscript?: string | null;
  youtubeTranscriptLanguage?: string | null;
  youtubeTranscriptAuto?: boolean;
};

export type DraftCandidate = {
  id: string;
  title: string;
  summary_one_line: string;
  angle: string;
};

/** Summarized draft fields carried from analyze → commit. */
export type ArticleDraftPayload = {
  synthesizedBodyKo: string;
  titleKo: string | null;
  summaryKo: string | null;
  bodyOriginal: string | null;
  summaryOriginal: string | null;
  contentLanguage: ContentLanguage;
  /** Filled before commit when original is Korean (EN columns + en localization). */
  titleEn?: string | null;
  summaryEn?: string | null;
  bodyEn?: string | null;
  /** Quality gates relaxed: short source / generated body under 900 chars. */
  shortSourceDraft?: boolean;
};

export type LinkTypeLabelKey = LinkType;
