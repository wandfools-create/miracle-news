/** America/New_York helpers + fixed UTC cron documentation. */

export const CRON_TIMEZONE = "America/New_York";

export type AmericaNewYorkParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/**
 * Wall-clock parts in America/New_York via Intl (handles EST/EDT automatically).
 */
export function getAmericaNewYorkParts(now: Date = new Date()): AmericaNewYorkParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CRON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
  };
}

/** True when New York local hour equals `hour` (0–23). */
export function isAmericaNewYorkHour(
  hour: number,
  now: Date = new Date()
): boolean {
  return getAmericaNewYorkParts(now).hour === hour;
}

/** YYYY-MM-DD in America/New_York (Shorts edit date; DST-safe). */
export function formatAmericaNewYorkDateKey(
  value: string | Date | null | undefined,
  now: Date = new Date()
): string {
  const date =
    value instanceof Date
      ? value
      : value
        ? new Date(value)
        : now;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CRON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Hobby-safe: keep exactly two once-daily Vercel cron definitions. Additional
 * collect-only runs are scheduled by GitHub Actions because Vercel Hobby cron
 * jobs cannot run more than once per day.
 *
 * Collection slots: 00:00 / 06:00 / 12:00 / 18:00 UTC.
 * US brief: 12:00 UTC → 08:00 EDT / 07:00 EST.
 * KR brief: 00:00 UTC → 20:00 EDT / 19:00 EST.
 */
export const VERCEL_CRON_DESK_US_UTC = "0 12 * * *";
export const VERCEL_CRON_DESK_KR_UTC = "0 0 * * *";

export const DESK_US_BRIEF_HOUR_UTC = 12;
export const DESK_KR_BRIEF_HOUR_UTC = 0;
