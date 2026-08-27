import type { ShortsDesk } from "@/lib/shorts/shortsPolicy";

export const SHORTS_CLOSING_LINE = "자세한 내용은 한눈에서 확인하세요.";

/** Max chars of article body sent to OpenAI prompt. */
export const SHORTS_ARTICLE_BODY_EXCERPT_MAX = 1200;

export type ShortsPackageScene = {
  index: number;
  subtitle: string;
  visualPlan: string;
  durationSec?: number;
};

export type ShortsArticleMediaSuggestion = {
  articleId: string;
  title: string;
  /** Hannoon public article URL (server-built). */
  url: string | null;
  imageSuggestion: string;
  videoSuggestion: string;
};

export type ShortsSourceArticleRef = {
  articleId: string;
  /** Hannoon public article title. */
  title: string;
  /** Hannoon public article URL (server-built). */
  hannoonUrl: string | null;
  /** Original publisher display name. */
  sourceDisplayName: string | null;
  /** Original source article URL. */
  originalUrl: string | null;
};

/** Structured AI production package (validated JSON). */
export type ShortsProductionPackageContent = {
  title: string;
  hook: string;
  narration: string;
  scenes: ShortsPackageScene[];
  articleMediaSuggestions: ShortsArticleMediaSuggestion[];
  sourceArticles: ShortsSourceArticleRef[];
  estimatedDurationSec: number;
  closingLine: string;
};

export type ShortsPackageStatus = "draft" | "reviewed";

export type ShortsGenerationMode = "stub" | "openai";

export type ShortsProductionPackageRecord = {
  id: string;
  desk: ShortsDesk;
  editDate: string;
  articleIds: string[];
  status: ShortsPackageStatus;
  package: ShortsProductionPackageContent;
  generationMode: ShortsGenerationMode;
  createdBy: string | null;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};
