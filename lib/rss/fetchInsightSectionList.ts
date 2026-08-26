/**
 * Insight Korea (insight.co.kr) section-list collector.
 * No official RSS — parse public section HTML (NewsArticle cards).
 * Candidate metadata only (title/summary/thumb/date). No OpenAI.
 */

import type { ParsedRssItem } from "@/lib/rss/parseRssFeed";
import type { RssFeedCategory } from "@/lib/rss/feedSources";
import { stripHtmlToPlainText } from "@/lib/rss/stripHtml";

export const INSIGHT_SOURCE_KEY = "insight";
export const INSIGHT_LABEL = "인사이트";

export const INSIGHT_SECTION_PATHS = [
  "politics",
  "economy",
  "national",
  "global",
] as const;

export type InsightSectionPath = (typeof INSIGHT_SECTION_PATHS)[number];

export const INSIGHT_SECTION_CATEGORY: Record<
  InsightSectionPath,
  RssFeedCategory
> = {
  politics: "politics",
  economy: "economy",
  national: "society",
  global: "world",
};

export function insightSectionListUrl(section: InsightSectionPath): string {
  return `https://www.insight.co.kr/${section}`;
}

/** Resolve section key from a registered feed URL. */
export function insightSectionFromFeedUrl(
  feedUrl: string
): InsightSectionPath | null {
  try {
    const path = new URL(feedUrl).pathname.replace(/\/+$/, "").toLowerCase();
    const seg = path.split("/").filter(Boolean).pop() ?? "";
    if ((INSIGHT_SECTION_PATHS as readonly string[]).includes(seg)) {
      return seg as InsightSectionPath;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type InsightListItem = {
  title: string;
  link: string;
  summary: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
};

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function absoluteInsightUrl(href: string): string | null {
  const raw = href.trim();
  if (!raw) return null;
  if (raw.startsWith("https://www.insight.co.kr/news/")) {
    return raw.split("?")[0] ?? raw;
  }
  if (raw.startsWith("/news/")) {
    return `https://www.insight.co.kr${raw.split("?")[0]}`;
  }
  return null;
}

/**
 * Parse Insight section listing HTML into article cards.
 * Uses schema.org NewsArticle blocks when present.
 */
export function parseInsightSectionListHtml(html: string): InsightListItem[] {
  const items: InsightListItem[] = [];
  const seen = new Set<string>();

  const blocks = html.split(/<article\b/i).slice(1);
  for (const block of blocks) {
    const chunk = block.slice(0, 6000);
    const hrefMatch = chunk.match(
      /href="((?:https:\/\/www\.insight\.co\.kr)?\/news\/\d+)"/i
    );
    if (!hrefMatch?.[1]) continue;
    const link = absoluteInsightUrl(hrefMatch[1]);
    if (!link || seen.has(link)) continue;

    const titleMatch =
      chunk.match(
        /itemprop=["']headline["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i
      ) ||
      chunk.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i) ||
      chunk.match(/<h3[^>]*itemprop=["']headline["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = titleMatch
      ? decodeBasicEntities(stripHtmlToPlainText(titleMatch[1] ?? ""))
      : "";
    if (!title || title.length < 4) continue;

    const summaryMatch =
      chunk.match(
        /itemprop=["']description["'][^>]*>\s*(?:<p>)?([\s\S]*?)(?:<\/p>)?\s*<\/div>/i
      ) ||
      chunk.match(
        /itemprop=["']articleBody["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
      ) ||
      chunk.match(/<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i) ||
      chunk.match(/<p>([\s\S]*?)<\/p>/i);
    const summaryRaw = summaryMatch
      ? decodeBasicEntities(stripHtmlToPlainText(summaryMatch[1] ?? ""))
      : "";
    const summary =
      summaryRaw && summaryRaw.length >= 8 ? summaryRaw.slice(0, 500) : null;

    const imgMatch =
      chunk.match(
        /itemprop=["']contentUrl["'][^>]*src=["']([^"']+)["']/i
      ) ||
      chunk.match(/<img[^>]+src=["']([^"']+)["']/i);
    const thumbnailUrl = imgMatch?.[1]?.trim() || null;

    const timeMatch =
      chunk.match(/datetime=["']([^"']+)["']/i) ||
      chunk.match(
        /itemprop=["']datePublished["'][^>]*content=["']([^"']+)["']/i
      ) ||
      chunk.match(
        /content=["']([^"']+)["'][^>]*itemprop=["']datePublished["']/i
      );
    const publishedAt = timeMatch?.[1]?.trim() || null;

    seen.add(link);
    items.push({
      title,
      link,
      summary,
      publishedAt,
      thumbnailUrl,
    });
  }

  return items;
}

export function insightListItemsToParsedRss(
  items: InsightListItem[]
): ParsedRssItem[] {
  return items.map((item) => ({
    title: item.title,
    link: item.link,
    publishedAt: item.publishedAt,
    summary: item.summary,
    guid: item.link,
    thumbnailUrl: item.thumbnailUrl,
    categories: [],
  }));
}

export async function fetchInsightSectionListItems(input: {
  section: InsightSectionPath;
  listUrl?: string;
  fetchImpl?: typeof fetch;
  limit?: number;
}): Promise<
  | { ok: true; items: ParsedRssItem[]; checked: number }
  | { ok: false; error: string }
> {
  const url = input.listUrl ?? insightSectionListUrl(input.section);
  const fetchFn = input.fetchImpl ?? fetch;
  const limit = Math.max(1, Math.min(input.limit ?? 30, 50));

  try {
    const res = await fetchFn(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "MiracleNewsBot/1.0 (+https://miraclenews.local; desk-collect)",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, error: `insight_http_${res.status}` };
    }
    const html = await res.text();
    const parsed = parseInsightSectionListHtml(html);
    const items = insightListItemsToParsedRss(parsed).slice(0, limit);
    return { ok: true, items, checked: parsed.length };
  } catch (err) {
    return {
      ok: false,
      error: `insight_fetch:${String(err).slice(0, 160)}`,
    };
  }
}
