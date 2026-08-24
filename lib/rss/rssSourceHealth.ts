/**
 * Code-level RSS collection health labels for admin (no OpenAI, no live fetch).
 * DB 72h metrics can be layered later; inactive feeds are reported from config.
 */

import {
  RSS_FEED_SOURCES,
  isRssFeedSourceEnabled,
  type RssFeedSource,
} from "@/lib/rss/feedSources";

export type RssSourceHealthLabel =
  | "정상"
  | "후보만 있음"
  | "무수집"
  | "오류"
  | "비활성";

export type RssSourceHealthRow = {
  sourceKey: string;
  label: string;
  feedUrl: string;
  enabled: boolean;
  /** Config-only status until DB metrics are attached. */
  status: RssSourceHealthLabel;
  note: string | null;
};

export function buildRssSourceHealthRows(
  feeds: RssFeedSource[] = RSS_FEED_SOURCES
): RssSourceHealthRow[] {
  return feeds.map((feed) => {
    const enabled = feed.enabled !== false;
    if (!enabled) {
      return {
        sourceKey: feed.sourceKey,
        label: feed.label,
        feedUrl: feed.feedUrl,
        enabled: false,
        status: "비활성",
        note: feed.disabledReason ?? "자동 수집 비활성",
      };
    }
    return {
      sourceKey: feed.sourceKey,
      label: feed.label,
      feedUrl: feed.feedUrl,
      enabled: true,
      status: "정상",
      note: null,
    };
  });
}

export function getRssSourceHealthLabel(sourceKey: string): RssSourceHealthLabel {
  if (!isRssFeedSourceEnabled(sourceKey)) return "비활성";
  return "정상";
}
