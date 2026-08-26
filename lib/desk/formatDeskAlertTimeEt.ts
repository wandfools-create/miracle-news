import { CRON_TIMEZONE } from "@/lib/cron/americaNewYork";

/** Wall-clock label for Discord desk alerts (America/New_York). */
export function formatDeskAlertTimeEt(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CRON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(now)
    .replace(",", "")
    .concat(" ET");
}
