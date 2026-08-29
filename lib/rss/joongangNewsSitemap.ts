export type JoongangNewsSitemapEntry = {
  loc: string;
  title: string;
  publishedAt: string | null;
};

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

/** Parse only current JoongAng article URLs from its official News Sitemap. */
export function parseJoongangNewsSitemapXml(
  xml: string
): JoongangNewsSitemapEntry[] {
  const entries: JoongangNewsSitemapEntry[] = [];
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/gi) ?? [];

  for (const block of blocks) {
    const loc =
      block.match(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/i)?.[1]?.trim() ??
      null;
    if (!loc || !/^https:\/\/www\.joongang\.co\.kr\/article\/\d+/i.test(loc)) {
      continue;
    }

    const titleCdata =
      block.match(
        /<news:title>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/news:title>/i
      )?.[1] ?? null;
    const titlePlain =
      block.match(/<news:title>\s*([^<]+?)\s*<\/news:title>/i)?.[1] ?? null;
    const title = decodeXmlText((titleCdata ?? titlePlain ?? "").trim());
    if (!title) continue;

    const pubRaw =
      block
        .match(
          /<news:publication_date>\s*([^<]+?)\s*<\/news:publication_date>/i
        )?.[1]
        ?.trim() ?? null;
    let publishedAt: string | null = null;
    if (pubRaw) {
      const timestamp = new Date(pubRaw).getTime();
      if (Number.isFinite(timestamp)) {
        publishedAt = new Date(timestamp).toISOString();
      }
    }

    entries.push({
      loc: loc.split("?")[0],
      title,
      publishedAt,
    });
  }

  return entries;
}

export function prepareJoongangLatestItems(input: {
  xml: string;
  nowMs?: number;
}): { items: ParsedRssItem[]; checked: number; skipped: number } {
  const entries = parseJoongangNewsSitemapXml(input.xml);
  const nowMs = input.nowMs ?? Date.now();
  const items: ParsedRssItem[] = [];
  let skipped = 0;

  for (const entry of entries) {
    if (evaluateRssItemAge(entry.publishedAt, nowMs).action === "skip_old") {
      skipped += 1;
      continue;
    }
    items.push({
      title: entry.title,
      link: entry.loc,
      publishedAt: entry.publishedAt,
      summary: null,
      guid: entry.loc,
      thumbnailUrl: null,
      categories: [],
    });
  }

  return { items, checked: entries.length, skipped };
}
import { evaluateRssItemAge } from "@/lib/rss/rssItemFreshness";
import type { ParsedRssItem } from "@/lib/rss/parseRssFeed";
