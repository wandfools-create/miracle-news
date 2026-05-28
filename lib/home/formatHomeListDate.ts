import type { ArticleLocale } from "@/lib/article/formatPublishedDate";

/** Compact relative/absolute date for home list cards. */
export function formatHomeListDate(
  value: string | null,
  locale: ArticleLocale
): string {
  if (!value) {
    return locale === "ko" ? "날짜 미정" : "Date unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return locale === "ko" ? "날짜 미정" : "Date unavailable";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);

  if (locale === "ko") {
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function truncateSummary(
  value: string | null | undefined,
  maxLength: number,
  locale: ArticleLocale
): string {
  const empty = locale === "ko" ? "요약이 없습니다." : "No summary available.";
  if (!value) return empty;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}…`;
}
