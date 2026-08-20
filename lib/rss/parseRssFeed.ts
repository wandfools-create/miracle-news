import Parser from "rss-parser";

import { stripHtmlToPlainText } from "@/lib/rss/stripHtml";

export type ParsedRssItem = {
  title: string;
  link: string;
  publishedAt: string | null;
  summary: string | null;
  guid: string | null;
};

export type ParseRssFeedResult =
  | { ok: true; items: ParsedRssItem[] }
  | { ok: false; error: string };

const parser = new Parser({
  timeout: 20_000,
  headers: {
    "User-Agent": "HannoonNewsBot/1.0 (+https://hannoon.news; rss-collect-v1)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
});

const MAX_SUMMARY_CHARS = 1_200;

function pickLink(item: Parser.Item): string | null {
  const link = item.link?.trim();
  if (link) return link;

  const guid = item.guid?.trim();
  if (guid && /^https?:\/\//i.test(guid)) return guid;

  return null;
}

function pickPublishedAt(item: Parser.Item): string | null {
  const raw = item.isoDate || item.pubDate;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function pickSummary(item: Parser.Item): string | null {
  const raw =
    item.contentSnippet?.trim() ||
    item.summary?.trim() ||
    (typeof item.content === "string" ? item.content : "") ||
    "";

  if (!raw) return null;
  const plain = stripHtmlToPlainText(raw);
  if (!plain) return null;
  return plain.length > MAX_SUMMARY_CHARS
    ? `${plain.slice(0, MAX_SUMMARY_CHARS - 1)}…`
    : plain;
}

export async function parseRssFeed(feedUrl: string): Promise<ParseRssFeedResult> {
  try {
    const feed = await parser.parseURL(feedUrl);
    const items: ParsedRssItem[] = [];

    for (const item of feed.items ?? []) {
      const title = (item.title || "").trim();
      const link = pickLink(item);
      if (!title || !link) continue;

      items.push({
        title,
        link,
        publishedAt: pickPublishedAt(item),
        summary: pickSummary(item),
        guid: item.guid?.trim() || item.id?.trim() || null,
      });
    }

    return { ok: true, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
