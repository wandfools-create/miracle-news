import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import {
  CRON_TIMEZONE,
  formatAmericaNewYorkDateKey,
} from "@/lib/cron/americaNewYork";

const TZ = CRON_TIMEZONE;

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Calendar-day difference between two YYYY-MM-DD keys (NY wall dates). */
export function nyDateKeyDiff(fromKey: string, toKey: string): number {
  if (!fromKey || !toKey) return 0;
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
}

export function offsetNyDateKey(dateKey: string, dayOffset: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + dayOffset, 17, 0, 0);
  return formatAmericaNewYorkDateKey(new Date(utc));
}

function formatTimeOfDay(
  date: Date,
  locale: ArticleLocale
): string {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDayPeriod(
  date: Date,
  locale: ArticleLocale
): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      hourCycle: "h23",
    }).format(date)
  );
  if (locale === "ko") {
    return hour < 12 ? "오전" : "오후";
  }
  return "";
}

/**
 * Home card relative time — America/New_York calendar day boundaries.
 * Same NY date: Today 8:10 AM / 오늘 오전 8:10
 * Previous NY date: Yesterday / 어제
 * 2–6 NY days ago: 2 days ago / 2일 전
 */
export function formatHomeRelativeTime(
  publishedAt: string | null | undefined,
  locale: ArticleLocale,
  nowMs: number = Date.now()
): string {
  const ts = parseTimestamp(publishedAt);
  if (ts <= 0) {
    return locale === "ko" ? "날짜 미정" : "Date unavailable";
  }

  const date = new Date(ts);
  const nowKey = formatAmericaNewYorkDateKey(new Date(nowMs));
  const articleKey = formatAmericaNewYorkDateKey(date);
  const dayDiff = nyDateKeyDiff(articleKey, nowKey);

  const time = formatTimeOfDay(date, locale);

  if (locale === "ko") {
    if (dayDiff === 0) {
      const formatted = new Intl.DateTimeFormat("ko-KR", {
        timeZone: TZ,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
      return `오늘 ${formatted}`;
    }
    if (dayDiff === 1) {
      const formatted = new Intl.DateTimeFormat("ko-KR", {
        timeZone: TZ,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
      return `어제 ${formatted}`;
    }
    if (dayDiff >= 2 && dayDiff <= 6) {
      return `${dayDiff}일 전`;
    }
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: TZ,
      month: "short",
      day: "numeric",
    }).format(date);
  }

  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Yesterday ${time}`;
  if (dayDiff >= 2 && dayDiff <= 6) return `${dayDiff} days ago`;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Short time for edition header last-updated line (NY timezone). */
export function formatEditionLastUpdated(
  publishedAt: string | null | undefined,
  locale: ArticleLocale
): string {
  const ts = parseTimestamp(publishedAt);
  if (ts <= 0) return "";
  const date = new Date(ts);

  if (locale === "ko") {
    const period = formatDayPeriod(date, locale);
    const time = formatTimeOfDay(date, locale).replace(/\s*(AM|PM)/i, "").trim();
    return `${period} ${time}`.trim();
  }
  return formatTimeOfDay(date, locale);
}
