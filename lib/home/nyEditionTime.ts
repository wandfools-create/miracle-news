import {
  formatAmericaNewYorkDateKey,
  getAmericaNewYorkParts,
} from "@/lib/cron/americaNewYork";

/** UTC ms for America/New_York midnight at the start of `dateKey` (YYYY-MM-DD). */
export function startOfNyDateKeyMs(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  for (let hour = -36; hour <= 36; hour += 1) {
    const ms = Date.UTC(y, m - 1, d, 12 + hour, 0, 0, 0);
    const key = formatAmericaNewYorkDateKey(new Date(ms));
    if (key !== dateKey) continue;
    const parts = getAmericaNewYorkParts(new Date(ms));
    if (parts.hour === 0 && parts.minute === 0) return ms;
  }
  return Date.UTC(y, m - 1, d, 4, 0, 0, 0);
}

/** Last millisecond before the current NY edition day begins. */
export function endOfPriorNyEditionMs(currentEditionDateKey: string): number {
  return startOfNyDateKeyMs(currentEditionDateKey) - 1;
}
