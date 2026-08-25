import "server-only";

import { evaluateRssItemAge } from "@/lib/rss/rssItemFreshness";
import type { ParsedRssItem } from "@/lib/rss/parseRssFeed";
import {
  evaluateYonhapKrRadarTitle,
  guessYonhapRadarCategory,
  selectYonhapRadarClusterRepresentatives,
  YONHAP_KR_RADAR_SITEMAPS,
  type YonhapRadarItem,
} from "@/lib/rss/yonhapKrRadarPolicy";
import { parseYonhapNewsSitemapXml } from "@/lib/rss/yonhapKrRadarSitemap";

const FETCH_HEADERS = {
  "User-Agent": "HannoonNewsBot/1.0 (+https://hannoon.news; yonhap-kr-radar-v1)",
  Accept: "application/xml, text/xml, */*",
};

async function fetchSitemapXml(url: string): Promise<
  { ok: true; xml: string } | { ok: false; error: string }
> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    if (!xml.includes("<urlset") && !xml.includes("<url>")) {
      return { ok: false, error: "not_sitemap_xml" };
    }
    return { ok: true, xml };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fetch all configured sitemaps → 72h filter → radar title rules →
 * same-event cluster collapse. No article body fetch.
 */
export async function fetchYonhapKrRadarItems(input?: {
  sitemapUrls?: readonly string[];
  /** Injected XML map for fixtures (url → xml). */
  fixtureXmlByUrl?: Record<string, string>;
  nowMs?: number;
}): Promise<
  | { ok: true; items: ParsedRssItem[]; checked: number; skipped: number }
  | { ok: false; error: string }
> {
  const urls = input?.sitemapUrls ?? YONHAP_KR_RADAR_SITEMAPS;
  const nowMs = input?.nowMs ?? Date.now();

  const merged = new Map<string, YonhapRadarItem>();
  let checked = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const url of urls) {
    let xml: string;
    if (input?.fixtureXmlByUrl?.[url]) {
      xml = input.fixtureXmlByUrl[url];
    } else {
      const fetched = await fetchSitemapXml(url);
      if (!fetched.ok) {
        errors.push(`${url}:${fetched.error}`);
        continue;
      }
      xml = fetched.xml;
    }

    for (const entry of parseYonhapNewsSitemapXml(xml)) {
      checked += 1;
      const age = evaluateRssItemAge(entry.publishedAt, nowMs);
      if (age.action === "skip_old") {
        skipped += 1;
        continue;
      }

      const decision = evaluateYonhapKrRadarTitle(entry.title, entry.loc);
      if (decision.action === "skip") {
        skipped += 1;
        continue;
      }

      const prev = merged.get(entry.loc);
      if (!prev) {
        merged.set(entry.loc, {
          title: entry.title,
          link: entry.loc,
          publishedAt: entry.publishedAt,
        });
      }
    }
  }

  if (merged.size === 0 && errors.length === urls.length) {
    return { ok: false, error: errors.join("; ") || "all_sitemaps_failed" };
  }

  const clustered = selectYonhapRadarClusterRepresentatives([
    ...merged.values(),
  ]);
  skipped += merged.size - clustered.length;

  const items: ParsedRssItem[] = clustered.map((item) => ({
    title: item.title,
    link: item.link,
    publishedAt: item.publishedAt,
    summary: null,
    guid: item.link,
    thumbnailUrl: null,
    categories: (() => {
      const cat = guessYonhapRadarCategory(item.title);
      return cat ? [cat] : [];
    })(),
  }));

  return { ok: true, items, checked, skipped };
}
