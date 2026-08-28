import type { RssFeedSource } from "@/lib/rss/feedSources";
import {
  RSS_MAX_INSERTS_PER_FEED,
  rssFeedInsertQuota,
} from "@/lib/rss/rssItemFreshness";

export type PublisherFeedStats = {
  sourceKey: string;
  category?: string;
  saved: number;
  queueLength: number;
};

export function uniquePublisherKeys<T extends { sourceKey: string }>(
  rows: T[]
): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const row of rows) {
    if (seen.has(row.sourceKey)) continue;
    seen.add(row.sourceKey);
    keys.push(row.sourceKey);
  }
  return keys;
}

/** Least saved first; stable tie keeps registration order. */
export function sortFeedsByLeastSaved(
  feeds: PublisherFeedStats[]
): PublisherFeedStats[] {
  return [...feeds]
    .filter((f) => f.queueLength > 0)
    .sort((a, b) => a.saved - b.saved);
}

/**
 * Simulate category rotation for one publisher: repeatedly pick least-saved
 * feed with queue and take 1 until maxNewInserts or no progress.
 */
export function simulatePublisherCategoryRotation(
  feeds: PublisherFeedStats[],
  maxNewInserts: number
): PublisherFeedStats[] {
  const state = feeds.map((f) => ({ ...f }));
  let saved = 0;
  let stagnantRounds = 0;

  while (saved < maxNewInserts) {
    const candidates = sortFeedsByLeastSaved(state);
    if (candidates.length === 0) break;

    let roundProgress = false;
    for (const feed of candidates) {
      if (saved >= maxNewInserts) break;
      if (feed.queueLength <= 0) continue;
      feed.queueLength -= 1;
      feed.saved += 1;
      saved += 1;
      roundProgress = true;
    }

    if (!roundProgress) {
      stagnantRounds += 1;
      if (stagnantRounds >= 2) break;
    } else {
      stagnantRounds = 0;
    }
  }

  return state;
}

/** Publisher seed: 1 opportunity each before any publisher gets a second save. */
export function simulatePublisherSeedPass(
  publishers: PublisherFeedStats[][]
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const feeds of publishers) {
    const key = feeds[0]?.sourceKey;
    if (!key) continue;
    totals.set(key, 0);
  }

  for (const feeds of publishers) {
    const key = feeds[0]?.sourceKey;
    if (!key || (totals.get(key) ?? 0) > 0) continue;
    const after = simulatePublisherCategoryRotation(feeds, 1);
    totals.set(key, after.reduce((n, f) => n + f.saved, 0));
  }

  return totals;
}

export function publisherQuotaRemaining(
  pass: 1 | 2,
  alreadyInserted: number,
  maxInserts = RSS_MAX_INSERTS_PER_FEED
): number {
  return rssFeedInsertQuota({
    pass,
    alreadyInserted,
    runBudgetRemaining: Number.MAX_SAFE_INTEGER,
    maxInserts,
  });
}

export type { RssFeedSource };
