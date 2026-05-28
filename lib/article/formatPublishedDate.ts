export type ArticleLocale = "ko" | "en";

export type FormattedPublishedDate = {
  /** Primary line, e.g. "2026년 5월 27일 수요일" */
  primary: string;
  /** Secondary line, e.g. "오전 9:30" — empty when time unavailable */
  time: string;
  /** Combined for compact UI */
  full: string;
  isValid: boolean;
};

export function formatPublishedDate(
  value: string | null,
  locale: ArticleLocale
): FormattedPublishedDate {
  const fallback =
    locale === "ko"
      ? { primary: "발행일 미정", time: "", full: "발행일 미정", isValid: false }
      : {
          primary: "Date unavailable",
          time: "",
          full: "Date unavailable",
          isValid: false,
        };

  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  if (locale === "ko") {
    const primary = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(date);

    const time = new Intl.DateTimeFormat("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);

    return {
      primary,
      time,
      full: time ? `${primary} · ${time}` : primary,
      isValid: true,
    };
  }

  const primary = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return {
    primary,
    time,
    full: time ? `${primary} · ${time}` : primary,
    isValid: true,
  };
}

export function getArticleTimestamp(value: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
