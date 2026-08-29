import "server-only";

import { prepareJoongangLatestItems } from "@/lib/rss/joongangNewsSitemap";
import type { ParsedRssItem } from "@/lib/rss/parseRssFeed";

export const JOONGANG_LATEST_SITEMAP_URL =
  "https://www.joongang.co.kr/sitemap/latest-articles";

const FETCH_HEADERS = {
  "User-Agent": "HannoonNewsBot/1.0 (+https://www.hannoon.co; joongang-sitemap-v1)",
  Accept: "application/xml, text/xml, */*",
};

export async function fetchJoongangLatestItems(input?: {
  sitemapUrl?: string;
  fixtureXml?: string;
  nowMs?: number;
}): Promise<
  | { ok: true; items: ParsedRssItem[]; checked: number; skipped: number }
  | { ok: false; error: string }
> {
  let xml = input?.fixtureXml ?? null;
  if (!xml) {
    try {
      const response = await fetch(
        input?.sitemapUrl ?? JOONGANG_LATEST_SITEMAP_URL,
        {
          headers: FETCH_HEADERS,
          signal: AbortSignal.timeout(20_000),
          cache: "no-store",
        }
      );
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
      }
      xml = await response.text();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (!xml.includes("<urlset") || !xml.includes("<news:news")) {
    return { ok: false, error: "not_joongang_news_sitemap" };
  }

  return {
    ok: true,
    ...prepareJoongangLatestItems({ xml, nowMs: input?.nowMs }),
  };
}
