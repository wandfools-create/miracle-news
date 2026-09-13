/**
 * Pure News Wire query helpers (no DB / OpenAI).
 * Used by fetchNewsWire and unit tests.
 */
import { localizeSourceLabel } from "@/lib/article/sourceDisplayLabels";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import { formatAmericaNewYorkDateKey } from "@/lib/cron/americaNewYork";
import { startOfNyDateKeyMs } from "@/lib/home/nyEditionTime";
import {
  compareNewsWireItems,
  parseWireGrade,
} from "@/lib/news-wire/rankNewsWire";
import {
  NEWS_WIRE_HOME_LIMIT,
  NEWS_WIRE_MAX_PAGE,
  NEWS_WIRE_PAGE_SIZE,
  type NewsWireDbRow,
  type NewsWireItem,
  type NewsWireLocale,
} from "@/lib/news-wire/types";
import {
  displayOriginalWireTitle,
  sanitizeWireOutboundUrl,
} from "@/lib/news-wire/wireTitles";

/** Finite positive page integer; clamps absurd values. */
export function parseNewsWirePage(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), NEWS_WIRE_MAX_PAGE);
}

export function isValidCalendarDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return false;
  const utc = new Date(Date.UTC(y, m - 1, d));
  return (
    utc.getUTCFullYear() === y &&
    utc.getUTCMonth() === m - 1 &&
    utc.getUTCDate() === d
  );
}

/** Next civil YYYY-MM-DD (calendar arithmetic — not +24h). */
export function nextCalendarDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * America/New_York day bounds using the next NY day's actual start
 * (DST-safe — not start+24h).
 */
export function nyDateKeyBounds(
  dateKey: string
): { startIso: string; endIso: string } | null {
  if (!isValidCalendarDateKey(dateKey)) return null;
  const startMs = startOfNyDateKeyMs(dateKey);
  if (!Number.isFinite(startMs)) return null;
  const nextKey = nextCalendarDateKey(dateKey);
  if (!isValidCalendarDateKey(nextKey)) return null;
  const endMs = startOfNyDateKeyMs(nextKey);
  if (!Number.isFinite(endMs) || endMs <= startMs) return null;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

export function todayNyDateKey(nowMs = Date.now()): string {
  return formatAmericaNewYorkDateKey(new Date(nowMs));
}

type RankedPublic = {
  publicItem: NewsWireItem;
  sortKey: {
    id: string;
    aiRecommendGrade: ReturnType<typeof parseWireGrade>;
    aiRecommendScore: number | null;
    publishedAt: string | null;
    collectedAt: string;
  };
};

function toRankedPublic(
  row: NewsWireDbRow,
  locale: NewsWireLocale
): RankedPublic | null {
  const originalUrl = sanitizeWireOutboundUrl(row.original_url);
  if (!originalUrl) return null;
  const title = displayOriginalWireTitle(row);
  if (!title) return null;

  const baseLabel =
    getArticleSourceLabel({
      source: row.source,
      original_url: row.original_url,
    }) ||
    row.feed_label?.trim() ||
    row.source;
  const sourceLabel = localizeSourceLabel(baseLabel, locale, row.source);

  return {
    publicItem: {
      id: row.id,
      title,
      sourceLabel,
      publishedAt: row.rss_published_at,
      collectedAt: row.created_at,
      originalUrl,
    },
    sortKey: {
      id: row.id,
      aiRecommendGrade: parseWireGrade(row.ai_recommend_grade),
      aiRecommendScore:
        typeof row.ai_recommend_score === "number"
          ? row.ai_recommend_score
          : null,
      publishedAt: row.rss_published_at,
      collectedAt: row.created_at,
    },
  };
}

/** Filter URL + sort — grades stay on server sort keys only. */
export function rankDbRowsToPublicItems(
  rows: NewsWireDbRow[],
  locale: NewsWireLocale,
  nowMs: number
): NewsWireItem[] {
  const ranked: RankedPublic[] = [];
  for (const row of rows) {
    const item = toRankedPublic(row, locale);
    if (item) ranked.push(item);
  }
  ranked.sort((a, b) => compareNewsWireItems(a.sortKey, b.sortKey, nowMs));
  return ranked.map((r) => r.publicItem);
}

export function selectHomeNewsWireItems(
  rows: NewsWireDbRow[],
  locale: NewsWireLocale,
  nowMs: number
): NewsWireItem[] {
  return rankDbRowsToPublicItems(rows, locale, nowMs).slice(
    0,
    NEWS_WIRE_HOME_LIMIT
  );
}

export function paginateNewsWireItems(
  ranked: NewsWireItem[],
  pageRaw: unknown
): {
  items: NewsWireItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalReady: number;
} {
  const page = parseNewsWirePage(pageRaw);
  const totalReady = ranked.length;
  const start = (page - 1) * NEWS_WIRE_PAGE_SIZE;
  return {
    items: ranked.slice(start, start + NEWS_WIRE_PAGE_SIZE),
    page,
    pageSize: NEWS_WIRE_PAGE_SIZE,
    hasMore: start + NEWS_WIRE_PAGE_SIZE < totalReady,
    totalReady,
  };
}

export function newsWireIdOrder(items: NewsWireItem[]): string[] {
  return items.map((i) => i.id);
}
