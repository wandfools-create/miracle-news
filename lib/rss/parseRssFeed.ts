import Parser from "rss-parser";

import { stripHtmlToPlainText } from "@/lib/rss/stripHtml";

export type ParsedRssItem = {
  title: string;
  link: string;
  publishedAt: string | null;
  summary: string | null;
  guid: string | null;
  /** From media:content / media:thumbnail / enclosure when present. */
  thumbnailUrl: string | null;
  /** RSS <category> values (e.g. TV조선 정치/스포츠). */
  categories: string[];
};

export type ParseRssFeedResult =
  | { ok: true; items: ParsedRssItem[] }
  | { ok: false; error: string };

type MediaLike = {
  $?: { url?: string; medium?: string; type?: string };
  url?: string;
};

type EnclosureLike = {
  url?: string;
  type?: string;
};

type CustomRssItem = Parser.Item & {
  mediaContent?: MediaLike | MediaLike[];
  mediaThumbnail?: MediaLike | MediaLike[];
  enclosure?: EnclosureLike | EnclosureLike[];
  categories?: string[];
  category?: string | string[];
  id?: string;
};

const parser = new Parser({
  timeout: 20_000,
  headers: {
    "User-Agent": "HannoonNewsBot/1.0 (+https://hannoon.news; rss-collect-v1)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
    ],
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

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function looksLikeImageUrl(url: string, type?: string | null): boolean {
  if (type && /^image\//i.test(type)) return true;
  return /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(url);
}

function mediaUrl(entry: MediaLike | undefined): string | null {
  if (!entry) return null;
  const url = (entry.$?.url || entry.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const type = entry.$?.type || undefined;
  const medium = entry.$?.medium || undefined;
  if (medium && medium.toLowerCase() === "image") return url;
  if (type && !looksLikeImageUrl(url, type) && !/^image\//i.test(type)) {
    return null;
  }
  if (!type && !medium && !looksLikeImageUrl(url, null)) {
    // media:content without type — still accept http(s) URLs (Chosun resizer).
    return url;
  }
  return url;
}

/** Prefer media:thumbnail / media:content image / image enclosure. */
export function pickRssThumbnailUrl(item: CustomRssItem): string | null {
  for (const thumb of asArray(item.mediaThumbnail)) {
    const url = mediaUrl(thumb);
    if (url) return url;
  }
  for (const content of asArray(item.mediaContent)) {
    const url = mediaUrl(content);
    if (url) return url;
  }
  for (const enc of asArray(item.enclosure)) {
    const url = enc?.url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (looksLikeImageUrl(url, enc.type)) return url;
  }
  return null;
}

export function pickRssCategories(item: CustomRssItem): string[] {
  const out: string[] = [];
  const push = (raw: string | undefined | null) => {
    const v = raw?.trim();
    if (v) out.push(v);
  };

  for (const c of item.categories ?? []) {
    push(typeof c === "string" ? c : String(c));
  }

  if (item.category) {
    if (Array.isArray(item.category)) {
      for (const c of item.category) push(String(c));
    } else {
      push(String(item.category));
    }
  }

  return [...new Set(out)];
}

export async function parseRssFeed(feedUrl: string): Promise<ParseRssFeedResult> {
  try {
    const feed = await parser.parseURL(feedUrl);
    const items: ParsedRssItem[] = [];

    for (const raw of feed.items ?? []) {
      const item = raw as CustomRssItem;
      const title = (item.title || "").trim();
      const link = pickLink(item);
      if (!title || !link) continue;

      items.push({
        title,
        link,
        publishedAt: pickPublishedAt(item),
        summary: pickSummary(item),
        guid: item.guid?.trim() || item.id?.trim() || null,
        thumbnailUrl: pickRssThumbnailUrl(item),
        categories: pickRssCategories(item),
      });
    }

    return { ok: true, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
