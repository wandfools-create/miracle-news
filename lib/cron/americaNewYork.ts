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

/**
 * Hobby-safe: one UTC cron per desk (2 total). No dual EST/EDT slots.
 * ±1h ET drift across DST is accepted.
 *
 * US desk  `0 12 * * *` → 08:00 EDT / 07:00 EST
 * Korea    `0 0 * * *`  → 20:00 EDT / 19:00 EST
 */
export const VERCEL_CRON_DESK_US_UTC = "0 12 * * *";
export const VERCEL_CRON_DESK_KR_UTC = "0 0 * * *";
