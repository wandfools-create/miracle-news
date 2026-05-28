import "server-only";

type Locale = "ko" | "en";

const TZ = "America/New_York";

function fallback(locale: Locale) {
  return locale === "ko" ? "날짜 미정" : "Date unavailable";
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatServerListDate(
  value: string | null | undefined,
  locale: Locale
): string {
  const date = parseDate(value);
  if (!date) return fallback(locale);

  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatServerPublishedFull(
  value: string | null | undefined,
  locale: Locale
): string {
  const date = parseDate(value);
  if (!date) return locale === "ko" ? "발행일 미정" : "Date unavailable";

  const localeTag = locale === "ko" ? "ko-KR" : "en-US";
  const primary = new Intl.DateTimeFormat(localeTag, {
    timeZone: TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat(localeTag, {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${primary} · ${time}`;
}

export function formatServerHeaderDate(locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}
