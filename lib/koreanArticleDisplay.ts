import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import {
  getArticleSourceLabel,
  isInternalArticleSource,
} from "@/lib/article/sourceResolution";
import { localizeSourceLabel } from "@/lib/article/sourceDisplayLabels";
import { normalizeSource } from "@/lib/article/normalizeSource";
import {
  featuredSourceConfigs,
  sourceConfigs,
  type SourceConfig,
} from "@/lib/article/sourceConfigs";

export { normalizeSource };

export type { SourceConfig };
export { sourceConfigs, featuredSourceConfigs };

const categoryLabelMap: Record<string, string> = {
  politics: "정치",
  economy: "경제",
  society: "사회",
  world: "국제",
  religion: "종교",
  other: "기타",
};

export const categoryOrder = [
  "politics",
  "economy",
  "society",
  "world",
  "religion",
  "other",
];

export function getCategoryLabel(value: string | null) {
  if (!value) return "미분류";
  return categoryLabelMap[value] ?? value;
}

export function formatDate(value: string | null) {
  if (!value) return "날짜 미정";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 미정";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);

  if (diffMin < 60) {
    return `${diffMin}분 전`;
  }

  if (diffHour < 24) {
    return `${diffHour}시간 전`;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function getTimestamp(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function truncateText(
  value: string | null | undefined,
  maxLength: number
) {
  if (!value) return "요약이 없습니다.";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

export { getArticleSourceLabel, isInternalArticleSource };

export function getSourceLabel(
  source: string,
  originalUrl?: string | null,
  locale: ArticleLocale = "ko"
) {
  const base = getArticleSourceLabel({ source, original_url: originalUrl });
  return localizeSourceLabel(base, locale, normalizeSource(source));
}

export function getSourceDescription(source: string) {
  const normalized = normalizeSource(source);
  const matched = sourceConfigs.find((config) => config.key === normalized);
  return matched ? matched.description : "출처 기반 기사";
}
