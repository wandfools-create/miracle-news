import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import {
  RSS_SOURCE_SECTION_ENRICHED,
  RSS_SOURCE_SECTION_STUB,
} from "@/lib/rss/feedSources";
import {
  parseRssEnrichFailureFromNotes,
  type ParsedRssEnrichFailure,
} from "@/lib/rss/enrichFailure";
import { SHORT_ARTICLE_REVIEW_NOTE } from "@/lib/from-link/validateArticleQuality";

export type ReviewQueueArticleRow = {
  id: string;
  source: string | null;
  source_section?: string | null;
  original_url: string | null;
  title_original: string | null;
  title_translated: string | null;
  title_ko: string | null;
  summary_original: string | null;
  summary_translated: string | null;
  summary_ko: string | null;
  body_original?: string | null;
  /** Korean body when `language_original` is `en` (DB has no `body_ko` column). */
  body_translated?: string | null;
  category: string | null;
  ai_review_status: string | null;
  review_status: string | null;
  status: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  collected_at: string | null;
  ai_review_notes?: string | null;
};

export type ReviewArticleDisplay = {
  id: string;
  sourceLabel: string;
  isRssCollect: boolean;
  displayTitle: string;
  displaySummary: string;
  originalTitle: string;
  categoryLabel: string;
  aiReviewLabel: string;
  reviewStatusLabel: string;
  translationLabel: string;
  translationClassName: string;
  bodyStatusLabel: string;
  imageStatusLabel: string;
  hasThumbnail: boolean;
  thumbnailUrl: string | null;
  collectedAtLabel: string;
  publishedAtLabel: string;
  statusValue: string;
  originalUrl: string | null;
  fromLinkHref: string | null;
  isRssStub: boolean;
  isRssEnriched: boolean;
  enrichFailure: ParsedRssEnrichFailure | null;
  shortArticleReviewRecommended: boolean;
};

const categoryLabelMap: Record<string, string> = {
  politics: "정치",
  economy: "경제",
  society: "사회",
  world: "국제",
  religion: "종교",
  other: "기타",
};

const aiReviewLabelMap: Record<string, string> = {
  pending: "대기",
  pass: "통과",
  warning: "주의",
  fail: "실패",
};

const reviewStatusLabelMap: Record<string, string> = {
  pending: "검토 전",
  approved: "승인 완료",
  needs_revision: "수정 필요",
  on_hold: "보류",
  rejected: "반려",
};

export function isRssCollectArticle(
  sourceSection: string | null | undefined
): boolean {
  const section = sourceSection?.trim() ?? "";
  return (
    section === RSS_SOURCE_SECTION_STUB ||
    section === RSS_SOURCE_SECTION_ENRICHED ||
    section.startsWith("rss:")
  );
}

export function isRssStubArticle(
  sourceSection: string | null | undefined
): boolean {
  const section = sourceSection?.trim() ?? "";
  return section === RSS_SOURCE_SECTION_STUB || section === "rss:collect-v1";
}

export function isRssEnrichedArticle(
  sourceSection: string | null | undefined
): boolean {
  const section = sourceSection?.trim() ?? "";
  return section === RSS_SOURCE_SECTION_ENRICHED || section === "rss:collect-v2";
}

export function safeTrimmed(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isUsableThumbnailUrl(url: string | null | undefined): boolean {
  const trimmed = safeTrimmed(url);
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatAdminDateTime(value: string | null | undefined): string {
  if (!value) return "시간 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function getCategoryLabel(value: string | null) {
  if (!value) return "미분류";
  return categoryLabelMap[value] ?? value;
}

function getAiReviewLabel(value: string | null) {
  if (!value) return "미정";
  return aiReviewLabelMap[value] ?? value;
}

function getReviewStatusLabel(value: string | null) {
  if (!value) return "미정";
  return reviewStatusLabelMap[value] ?? value;
}

/** Korean article body stored in `body_translated` for EN-original rows. */
export function getReviewKoBody(article: ReviewQueueArticleRow): string {
  return safeTrimmed(article.body_translated);
}

function hasUsableBody(article: ReviewQueueArticleRow): boolean {
  return (
    getReviewKoBody(article).length > 0 ||
    safeTrimmed(article.body_original).length > 0
  );
}

export function buildReviewArticleDisplay(
  article: ReviewQueueArticleRow
): ReviewArticleDisplay {
  const sourceLabel = getArticleSourceLabel({
    source: article.source ?? "",
    original_url: article.original_url,
  });

  const displayTitle =
    safeTrimmed(article.title_ko) ||
    safeTrimmed(article.title_translated) ||
    safeTrimmed(article.title_original) ||
    "제목 없음";

  const displaySummary =
    safeTrimmed(article.summary_ko) ||
    safeTrimmed(article.summary_translated) ||
    safeTrimmed(article.summary_original) ||
    "요약 없음";

  const originalTitle =
    safeTrimmed(article.title_original) ||
    safeTrimmed(article.title_translated) ||
    "원문 제목 없음";

  const hasKoTitle = safeTrimmed(article.title_ko).length > 0;
  const thumbnailUrl = isUsableThumbnailUrl(article.thumbnail_url)
    ? safeTrimmed(article.thumbnail_url)
    : null;

  const originalUrl = safeTrimmed(article.original_url) || null;
  const fromLinkHref = originalUrl
    ? `/admin/from-link?url=${encodeURIComponent(originalUrl)}`
    : null;

  const enrichFailure = parseRssEnrichFailureFromNotes(article.ai_review_notes);
  const isRssStub =
    isRssStubArticle(article.source_section) || Boolean(enrichFailure);
  const isRssEnriched = isRssEnrichedArticle(article.source_section);
  const notes = safeTrimmed(article.ai_review_notes);
  const shortArticleReviewRecommended = notes.includes(SHORT_ARTICLE_REVIEW_NOTE);

  return {
    id: article.id,
    sourceLabel,
    isRssCollect: isRssCollectArticle(article.source_section),
    displayTitle,
    displaySummary,
    originalTitle,
    categoryLabel: getCategoryLabel(article.category),
    aiReviewLabel: getAiReviewLabel(article.ai_review_status),
    reviewStatusLabel: getReviewStatusLabel(article.review_status),
    translationLabel: hasKoTitle ? "번역 완료" : "번역 대기",
    translationClassName: hasKoTitle
      ? "bg-blue-50 text-blue-700"
      : "bg-amber-50 text-amber-800",
    bodyStatusLabel: hasUsableBody(article) ? "본문 있음" : "본문 보강 필요",
    imageStatusLabel: thumbnailUrl ? "이미지 있음" : "이미지 없음",
    hasThumbnail: Boolean(thumbnailUrl),
    thumbnailUrl,
    collectedAtLabel: formatAdminDateTime(article.collected_at),
    publishedAtLabel: formatAdminDateTime(article.published_at),
    statusValue: safeTrimmed(article.status) || "상태 없음",
    originalUrl,
    fromLinkHref,
    isRssStub,
    isRssEnriched,
    enrichFailure,
    shortArticleReviewRecommended,
  };
}

export type NormalizeReviewRowResult =
  | { ok: true; display: ReviewArticleDisplay }
  | { ok: false; id: string; error: string; failedField?: string };

const DISPLAY_STEPS: Array<{
  field: string;
  run: (article: ReviewQueueArticleRow) => void;
}> = [
  {
    field: "source",
    run: (article) => {
      getArticleSourceLabel({
        source: article.source ?? "",
        original_url: article.original_url,
      });
    },
  },
  {
    field: "title",
    run: (article) => {
      safeTrimmed(article.title_ko) ||
        safeTrimmed(article.title_translated) ||
        safeTrimmed(article.title_original);
    },
  },
  {
    field: "summary",
    run: (article) => {
      safeTrimmed(article.summary_ko) ||
        safeTrimmed(article.summary_translated) ||
        safeTrimmed(article.summary_original);
    },
  },
  {
    field: "published_at",
    run: (article) => {
      formatAdminDateTime(article.published_at);
    },
  },
  {
    field: "collected_at",
    run: (article) => {
      formatAdminDateTime(article.collected_at);
    },
  },
  {
    field: "thumbnail_url",
    run: (article) => {
      isUsableThumbnailUrl(article.thumbnail_url);
    },
  },
];

export function normalizeReviewListRow(
  article: ReviewQueueArticleRow
): NormalizeReviewRowResult {
  const articleId = article.id ?? "unknown";

  for (const step of DISPLAY_STEPS) {
    try {
      step.run(article);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[admin/review] row field failed", {
        articleId,
        failedField: step.field,
        source: article.source,
        original_url: article.original_url,
        error: message,
        stack: err instanceof Error ? err.stack : undefined,
      });
      return {
        ok: false,
        id: articleId,
        error: message,
        failedField: step.field,
      };
    }
  }

  try {
    return { ok: true, display: buildReviewArticleDisplay(article) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/review] row display build failed", {
      articleId,
      failedField: "buildReviewArticleDisplay",
      source: article.source,
      original_url: article.original_url,
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return {
      ok: false,
      id: articleId,
      error: message,
      failedField: "buildReviewArticleDisplay",
    };
  }
}

export function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}
