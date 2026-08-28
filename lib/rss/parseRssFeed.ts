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
  | { ok: true; items: ParsedRssItem[]; skippedItems?: number }
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
  categories?: unknown;
  category?: unknown;
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

/**
 * Extract a displayable category label without ever calling String(object).
 * PBS/Fox rss-parser shapes: null-prototype `{ _: "Politics", $: { domain } }`.
 */
export function categoryValueToLabel(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const label = categoryValueToLabel(entry);
      if (label) return label;
    }
    return null;
  }
  if (typeof value === "object") {
    const underscore = (value as { _?: unknown })._;
    if (typeof underscore === "string") {
      const trimmed = underscore.trim();
      return trimmed || null;
    }
    if (Array.isArray(underscore)) {
      for (const entry of underscore) {
        if (typeof entry === "string") {
          const trimmed = entry.trim();
          if (trimmed) return trimmed;
        }
      }
    }
    return null;
  }
  return null;
}

export function pickRssCategories(item: CustomRssItem): string[] {
  const out: string[] = [];
  const push = (raw: unknown) => {
    const v = categoryValueToLabel(raw);
    if (v) out.push(v);
  };

  for (const c of asArray(item.categories)) {
    push(c);
  }

  if (item.category != null) {
    if (Array.isArray(item.category)) {
      for (const c of item.category) push(c);
    } else {
      push(item.category);
    }
  }

  return [...new Set(out)];
}

function safeGuid(item: CustomRssItem): string | null {
  const guid = item.guid;
  if (typeof guid === "string" && guid.trim()) return guid.trim();
  const id = item.id;
  if (typeof id === "string" && id.trim()) return id.trim();
  return null;
}

/**
 * Normalize one RSS item. Returns null when title/link missing or item throws.
 * Category/media/enclosure errors must not escape this function.
 */
export function normalizeRssFeedItem(
  raw: unknown
): ParsedRssItem | null {
  try {
    const item = raw as CustomRssItem;
    const title = (item.title || "").trim();
    const link = pickLink(item);
    if (!title || !link) return null;

    return {
      title,
      link,
      publishedAt: pickPublishedAt(item),
      summary: pickSummary(item),
      guid: safeGuid(item),
      thumbnailUrl: pickRssThumbnailUrl(item),
      categories: pickRssCategories(item),
    };
  } catch {
    return null;
  }
}

function collectItemsFromFeed(feed: {
  items?: Parser.Item[];
}): { items: ParsedRssItem[]; skippedItems: number } {
  const items: ParsedRssItem[] = [];
  let skippedItems = 0;

  for (const raw of feed.items ?? []) {
    const normalized = normalizeRssFeedItem(raw);
    if (normalized) {
      items.push(normalized);
      continue;
    }

    // Item had a link but failed normalization (thrown category/media/title shape).
    // Missing title/link alone is normal RSS noise — do not warn.
    const link = pickLink(raw as CustomRssItem);
    if (link) {
      skippedItems += 1;
      console.warn("[parseRssFeed] skipped item after normalize failure", {
        reason: "item_normalize_failed",
      });
    }
  }

  return { items, skippedItems };
}

async function parseRssFeedPayload(
  parse: () => Promise<{ items?: Parser.Item[] }>
): Promise<ParseRssFeedResult> {
  try {
    const feed = await parse();
    const { items, skippedItems } = collectItemsFromFeed(feed);
    return skippedItems > 0
      ? { ok: true, items, skippedItems }
      : { ok: true, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function parseRssFeed(feedUrl: string): Promise<ParseRssFeedResult> {
  return parseRssFeedPayload(() => parser.parseURL(feedUrl));
}

/** Fixture / tests: parse RSS XML string without network. */
export async function parseRssFeedXml(xml: string): Promise<ParseRssFeedResult> {
  return parseRssFeedPayload(() => parser.parseString(xml));
}
