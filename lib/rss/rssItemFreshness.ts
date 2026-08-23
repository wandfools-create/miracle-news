/** Freshness gate for RSS → collection_candidates (no OpenAI). */

/** Skip items older than this when a publish time is known. */
export const RSS_MAX_ITEM_AGE_MS = 72 * 60 * 60 * 1000;

/** Max items scanned from each feed per run. */
export const RSS_MAX_ITEMS_PER_FEED = 25;

/** Max new candidates inserted (or would-insert) per feed per run. */
export const RSS_MAX_INSERTS_PER_FEED = 5;

export type RssItemAgeDecision =
  | { action: "allow"; reason: "fresh" }
  | { action: "allow"; reason: "unknown_published_at" }
  | { action: "skip_old"; reason: "older_than_max_age"; ageMs: number };

export function evaluateRssItemAge(
  publishedAt: string | null | undefined,
  nowMs = Date.now(),
  maxAgeMs = RSS_MAX_ITEM_AGE_MS
): RssItemAgeDecision {
  const raw = publishedAt?.trim();
  if (!raw) {
    return { action: "allow", reason: "unknown_published_at" };
  }
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) {
    return { action: "allow", reason: "unknown_published_at" };
  }
  const ageMs = nowMs - t;
  if (ageMs > maxAgeMs) {
    return { action: "skip_old", reason: "older_than_max_age", ageMs };
  }
  return { action: "allow", reason: "fresh" };
}
