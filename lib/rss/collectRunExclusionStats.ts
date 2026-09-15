/**
 * Per-collect-run intake / exclusion counters (counts + fixed codes only).
 * Never stores titles, URLs, bodies, or external error text.
 *
 * Aggregation rules:
 * - Stages (rssReceived / dateOkWithin72h / saved) are progress metrics (not exclusive).
 * - Article exclusion reasons are final (one reason per processed item, in pipeline order).
 * - feedFetchFailed counts failed feeds, separate from article exclusions.
 * - Run-limit leftovers are 미처리 (unprocessed), never 제외.
 * - Unknown / unreconciled gaps surface as 미처리/기록 없음 — never invent zeros for legacy.
 */

export const COLLECT_RUN_EXCLUSION_STATS_VERSION = 2 as const;

export type CollectFeedStatRow = {
  feedKey: string;
  /** Desk category key when known; null otherwise. */
  category: string | null;
  rssReceived: number;
  dateOkWithin72h: number;
  undated: number;
  olderThan72h: number;
  duplicateUrl: number;
  feedOrSourceCap: number;
  fieldCountryKeyword: number;
  otherSkipped: number;
  saved: number;
  saveFailed: number;
  /** 1 when this feed failed to fetch/parse; else 0. */
  feedFetchFailed: number;
};

export type CollectSourceStatRow = {
  sourceKey: string;
  rssReceived: number;
  dateOkWithin72h: number;
  undated: number;
  olderThan72h: number;
  duplicateUrl: number;
  feedOrSourceCap: number;
  fieldCountryKeyword: number;
  otherSkipped: number;
  saved: number;
  saveFailed: number;
  feedFetchFailed: number;
  /** ISO timestamp for this run only; null = none. */
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  feeds: CollectFeedStatRow[];
};

export type CollectRunLimitStats = {
  configured: number;
  used: number;
  reached: boolean;
  /**
   * Exact leftover queue items attributed to the run limit (or known leftovers).
   * null = unknown — UI must show 기록 없음, never invent.
   */
  unprocessed: number | null;
};

export type CollectRunExclusionStats = {
  version: typeof COLLECT_RUN_EXCLUSION_STATS_VERSION;
  /** Stage: items present in fetched payloads. */
  rssReceived: number;
  /** Stage: passed date freshness (dated + within 72h, or allowed undated). */
  dateOkWithin72h: number;
  /** Stage: candidates saved this run. */
  saved: number;
  /** Failed feeds (not article rows). */
  feedFetchFailed: number;
  /** Final article reasons (mutually exclusive). */
  undated: number;
  olderThan72h: number;
  duplicateUrl: number;
  feedOrSourceCap: number;
  fieldCountryKeyword: number;
  otherSkipped: number;
  saveFailed: number;
  byCategory: Record<string, number>;
  runLimit: CollectRunLimitStats;
  sources: CollectSourceStatRow[];
};

/** Numeric article/stage keys shown in the run summary grid. */
export type CollectRunSummaryStatKey =
  | "rssReceived"
  | "dateOkWithin72h"
  | "saved"
  | "feedFetchFailed"
  | "undated"
  | "olderThan72h"
  | "duplicateUrl"
  | "feedOrSourceCap"
  | "fieldCountryKeyword"
  | "otherSkipped"
  | "saveFailed";

export const COLLECT_RUN_SUMMARY_STAT_LABELS: Record<
  CollectRunSummaryStatKey,
  string
> = {
  rssReceived: "RSS에서 받은 수",
  dateOkWithin72h: "날짜 정상·72시간 이내",
  saved: "수집 후보로 저장된 수",
  feedFetchFailed: "RSS 접속 실패(피드)",
  undated: "날짜 없음·날짜 파싱 실패",
  olderThan72h: "72시간 초과",
  duplicateUrl: "중복 URL",
  feedOrSourceCap: "피드/출처 제한",
  fieldCountryKeyword: "분야·국가·키워드 제외",
  otherSkipped: "기타 제외",
  saveFailed: "저장 실패",
};

/** @deprecated use COLLECT_RUN_SUMMARY_STAT_LABELS */
export const COLLECT_RUN_EXCLUSION_STAT_LABELS = COLLECT_RUN_SUMMARY_STAT_LABELS;

export type CollectRunExclusionStatKey = CollectRunSummaryStatKey;

const SOURCE_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const FEED_KEY_RE = /^[a-f0-9]{8}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const CATEGORY_RE = /^[a-z0-9_]{1,40}$/i;

/** Stable feed id from URL — never store the URL itself. */
export function stableFeedKey(feedUrl: string): string {
  let h = 2166136261;
  for (let i = 0; i < feedUrl.length; i++) {
    h ^= feedUrl.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function emptyFeedStatRow(
  feedKey: string,
  category: string | null = null
): CollectFeedStatRow {
  return {
    feedKey,
    category,
    rssReceived: 0,
    dateOkWithin72h: 0,
    undated: 0,
    olderThan72h: 0,
    duplicateUrl: 0,
    feedOrSourceCap: 0,
    fieldCountryKeyword: 0,
    otherSkipped: 0,
    saved: 0,
    saveFailed: 0,
    feedFetchFailed: 0,
  };
}

export function emptyCollectRunExclusionStats(
  runLimitConfigured = 0
): CollectRunExclusionStats {
  return {
    version: COLLECT_RUN_EXCLUSION_STATS_VERSION,
    rssReceived: 0,
    dateOkWithin72h: 0,
    saved: 0,
    feedFetchFailed: 0,
    undated: 0,
    olderThan72h: 0,
    duplicateUrl: 0,
    feedOrSourceCap: 0,
    fieldCountryKeyword: 0,
    otherSkipped: 0,
    saveFailed: 0,
    byCategory: {},
    runLimit: {
      configured: Math.max(0, runLimitConfigured),
      used: 0,
      reached: false,
      unprocessed: 0,
    },
    sources: [],
  };
}

function nonNegInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? Math.floor(v)
    : null;
}

function sumFeedRows(feeds: CollectFeedStatRow[]): Omit<
  CollectSourceStatRow,
  "sourceKey" | "lastSuccessAt" | "lastFailureAt" | "feeds"
> {
  const out = {
    rssReceived: 0,
    dateOkWithin72h: 0,
    undated: 0,
    olderThan72h: 0,
    duplicateUrl: 0,
    feedOrSourceCap: 0,
    fieldCountryKeyword: 0,
    otherSkipped: 0,
    saved: 0,
    saveFailed: 0,
    feedFetchFailed: 0,
  };
  for (const f of feeds) {
    out.rssReceived += f.rssReceived;
    out.dateOkWithin72h += f.dateOkWithin72h;
    out.undated += f.undated;
    out.olderThan72h += f.olderThan72h;
    out.duplicateUrl += f.duplicateUrl;
    out.feedOrSourceCap += f.feedOrSourceCap;
    out.fieldCountryKeyword += f.fieldCountryKeyword;
    out.otherSkipped += f.otherSkipped;
    out.saved += f.saved;
    out.saveFailed += f.saveFailed;
    out.feedFetchFailed += f.feedFetchFailed;
  }
  return out;
}

export function incrementCategoryCount(
  byCategory: Record<string, number>,
  category: string | null | undefined
): void {
  const key = (category ?? "uncategorized").trim() || "uncategorized";
  if (!CATEGORY_RE.test(key)) return;
  byCategory[key] = (byCategory[key] ?? 0) + 1;
}

/** Map field-profile / editorial decision keys into admin buckets. */
export function classifyFieldExclusionDecisionKey(
  decisionKey: string
): "fieldCountryKeyword" | "otherSkipped" {
  const key = decisionKey.trim().toLowerCase();
  if (
    key.startsWith("field-disabled:") ||
    key === "science-lifestyle-disabled" ||
    key === "unclassified-reject" ||
    key.startsWith("scope:") ||
    key.startsWith("field-exclude-kw:") ||
    key.startsWith("country-exclude:") ||
    key === "soft-public-health-noise"
  ) {
    return "fieldCountryKeyword";
  }
  return "otherSkipped";
}

/**
 * Final article reasons accounted (excludes stages + feedFetchFailed + unprocessed).
 */
export function sumFinalArticleReasons(stats: CollectRunExclusionStats): number {
  return (
    stats.undated +
    stats.olderThan72h +
    stats.duplicateUrl +
    stats.feedOrSourceCap +
    stats.fieldCountryKeyword +
    stats.otherSkipped +
    stats.saveFailed
  );
}

/**
 * Reconcile stage vs final reasons.
 * dateOk should equal saved + final-after-date reasons + unprocessed (when known).
 */
export function reconcileCollectRunStats(stats: CollectRunExclusionStats): {
  dateStageGap: number | null;
  receivedStageGap: number | null;
  balanced: boolean;
} {
  const afterDateReasons =
    stats.duplicateUrl +
    stats.feedOrSourceCap +
    stats.fieldCountryKeyword +
    stats.otherSkipped +
    stats.saveFailed +
    stats.saved;
  const unprocessed =
    stats.runLimit.unprocessed == null ? null : stats.runLimit.unprocessed;
  const dateExpected =
    unprocessed == null ? null : afterDateReasons + unprocessed;
  const dateStageGap =
    dateExpected == null ? null : stats.dateOkWithin72h - dateExpected;

  const receivedExpected =
    stats.undated + stats.olderThan72h + stats.dateOkWithin72h;
  const receivedStageGap = stats.rssReceived - receivedExpected;

  const balanced =
    receivedStageGap === 0 &&
    dateStageGap !== null &&
    dateStageGap === 0;

  return { dateStageGap, receivedStageGap, balanced };
}

export type ExclusionStatDisplay =
  | { kind: "value"; value: number }
  | { kind: "missing"; label: "기록 없음" }
  | { kind: "gap"; label: "미처리/기록 없음" };

export function displayExclusionStat(
  stats: CollectRunExclusionStats | null | undefined,
  key: CollectRunSummaryStatKey
): ExclusionStatDisplay {
  if (!stats) return { kind: "missing", label: "기록 없음" };
  return { kind: "value", value: stats[key] };
}

export function displayUnprocessed(
  stats: CollectRunExclusionStats | null | undefined
): ExclusionStatDisplay {
  if (!stats) return { kind: "missing", label: "기록 없음" };
  if (stats.runLimit.unprocessed == null) {
    return { kind: "gap", label: "미처리/기록 없음" };
  }
  return { kind: "value", value: stats.runLimit.unprocessed };
}

export function formatExclusionStatDisplay(d: ExclusionStatDisplay): string {
  if (d.kind === "value") return String(d.value);
  return d.label;
}

function parseFeedRow(raw: unknown): CollectFeedStatRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const feedKey = typeof row.feedKey === "string" ? row.feedKey : "";
  if (!FEED_KEY_RE.test(feedKey)) return null;
  const category =
    row.category == null
      ? null
      : typeof row.category === "string" && CATEGORY_RE.test(row.category)
        ? row.category
        : null;
  const nums: Array<keyof CollectFeedStatRow> = [
    "rssReceived",
    "dateOkWithin72h",
    "undated",
    "olderThan72h",
    "duplicateUrl",
    "feedOrSourceCap",
    "fieldCountryKeyword",
    "otherSkipped",
    "saved",
    "saveFailed",
    "feedFetchFailed",
  ];
  const out = emptyFeedStatRow(feedKey, category);
  for (const k of nums) {
    const n = nonNegInt(row[k]);
    if (n == null) return null;
    (out as Record<string, number | string | null>)[k] = n;
  }
  return out;
}

function parseSourceRow(raw: unknown): CollectSourceStatRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const sourceKey = typeof row.sourceKey === "string" ? row.sourceKey : "";
  if (!SOURCE_KEY_RE.test(sourceKey)) return null;
  if (!Array.isArray(row.feeds)) return null;
  const feeds: CollectFeedStatRow[] = [];
  for (const f of row.feeds) {
    const parsed = parseFeedRow(f);
    if (!parsed) return null;
    feeds.push(parsed);
  }
  const summed = sumFeedRows(feeds);
  const lastSuccessAt =
    row.lastSuccessAt == null
      ? null
      : typeof row.lastSuccessAt === "string" && ISO_RE.test(row.lastSuccessAt)
        ? row.lastSuccessAt
        : null;
  const lastFailureAt =
    row.lastFailureAt == null
      ? null
      : typeof row.lastFailureAt === "string" && ISO_RE.test(row.lastFailureAt)
        ? row.lastFailureAt
        : null;
  const pick = (key: keyof typeof summed): number => {
    const n = nonNegInt(row[key]);
    return n == null ? summed[key] : n;
  };
  return {
    sourceKey,
    rssReceived: pick("rssReceived"),
    dateOkWithin72h: pick("dateOkWithin72h"),
    undated: pick("undated"),
    olderThan72h: pick("olderThan72h"),
    duplicateUrl: pick("duplicateUrl"),
    feedOrSourceCap: pick("feedOrSourceCap"),
    fieldCountryKeyword: pick("fieldCountryKeyword"),
    otherSkipped: pick("otherSkipped"),
    saved: pick("saved"),
    saveFailed: pick("saveFailed"),
    feedFetchFailed: pick("feedFetchFailed"),
    lastSuccessAt,
    lastFailureAt,
    feeds,
  };
}

/**
 * Parse DB jsonb. Returns null when missing/invalid — UI shows 「기록 없음」.
 * Rejects `{}`, v1 payloads, and incomplete objects (never invent zeros).
 */
export function parseCollectRunExclusionStats(
  raw: unknown
): CollectRunExclusionStats | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.version !== COLLECT_RUN_EXCLUSION_STATS_VERSION) return null;
  if (
    !row.runLimit ||
    typeof row.runLimit !== "object" ||
    Array.isArray(row.runLimit)
  ) {
    return null;
  }
  if (!Array.isArray(row.sources)) return null;

  const runLimitRaw = row.runLimit as Record<string, unknown>;
  const configured = nonNegInt(runLimitRaw.configured);
  const used = nonNegInt(runLimitRaw.used);
  if (configured == null || used == null) return null;
  if (typeof runLimitRaw.reached !== "boolean") return null;
  const unprocessed =
    runLimitRaw.unprocessed === null
      ? null
      : nonNegInt(runLimitRaw.unprocessed);
  if (runLimitRaw.unprocessed !== null && unprocessed == null) return null;

  const stats = emptyCollectRunExclusionStats(configured);
  for (const key of Object.keys(
    COLLECT_RUN_SUMMARY_STAT_LABELS
  ) as CollectRunSummaryStatKey[]) {
    const parsed = nonNegInt(row[key]);
    if (parsed == null) return null;
    stats[key] = parsed;
  }

  const byCategory: Record<string, number> = {};
  if (
    row.byCategory &&
    typeof row.byCategory === "object" &&
    !Array.isArray(row.byCategory)
  ) {
    for (const [k, v] of Object.entries(
      row.byCategory as Record<string, unknown>
    )) {
      const n = nonNegInt(v);
      if (n == null || !CATEGORY_RE.test(k)) continue;
      byCategory[k] = n;
    }
  }
  stats.byCategory = byCategory;
  stats.runLimit = {
    configured,
    used,
    reached: runLimitRaw.reached,
    unprocessed,
  };

  const sources: CollectSourceStatRow[] = [];
  for (const s of row.sources) {
    const parsed = parseSourceRow(s);
    if (!parsed) return null;
    sources.push(parsed);
  }
  stats.sources = sources;
  return stats;
}

/**
 * Strip to fixed keys/codes/numbers only before DB write.
 * Returns null if nothing safe to store (caller should omit column → leave NULL).
 */
export function sanitizeCollectRunExclusionStatsForStorage(
  input: CollectRunExclusionStats | null | undefined
): CollectRunExclusionStats | null {
  if (!input) return null;
  const parsed = parseCollectRunExclusionStats(input);
  if (!parsed) return null;
  const out = emptyCollectRunExclusionStats(parsed.runLimit.configured);
  for (const key of Object.keys(
    COLLECT_RUN_SUMMARY_STAT_LABELS
  ) as CollectRunSummaryStatKey[]) {
    out[key] = parsed[key];
  }
  out.byCategory = { ...parsed.byCategory };
  out.runLimit = { ...parsed.runLimit };
  out.sources = parsed.sources.map((s) => ({
    sourceKey: s.sourceKey,
    rssReceived: s.rssReceived,
    dateOkWithin72h: s.dateOkWithin72h,
    undated: s.undated,
    olderThan72h: s.olderThan72h,
    duplicateUrl: s.duplicateUrl,
    feedOrSourceCap: s.feedOrSourceCap,
    fieldCountryKeyword: s.fieldCountryKeyword,
    otherSkipped: s.otherSkipped,
    saved: s.saved,
    saveFailed: s.saveFailed,
    feedFetchFailed: s.feedFetchFailed,
    lastSuccessAt: s.lastSuccessAt,
    lastFailureAt: s.lastFailureAt,
    feeds: s.feeds.map((f) => ({ ...f })),
  }));
  return out;
}

export function buildCollectRunExclusionStats(input: {
  feeds: Array<{
    sourceKey: string;
    feedUrl: string;
    category?: string | null;
    bucket: CollectFeedStatRow;
    fetchedOk: boolean;
    at: string;
  }>;
  byCategory: Record<string, number>;
  runLimitConfigured: number;
  runLimitUsed: number;
  /** Exact remaining queue items; null if unknown. */
  unprocessedExact: number | null;
}): CollectRunExclusionStats {
  const stats = emptyCollectRunExclusionStats(input.runLimitConfigured);
  stats.runLimit.used = Math.max(0, input.runLimitUsed);
  stats.runLimit.reached =
    input.runLimitConfigured > 0 &&
    stats.runLimit.used >= input.runLimitConfigured;
  stats.runLimit.unprocessed = input.unprocessedExact;
  stats.byCategory = { ...input.byCategory };

  const bySource = new Map<
    string,
    {
      feeds: CollectFeedStatRow[];
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
    }
  >();

  for (const row of input.feeds) {
    if (!SOURCE_KEY_RE.test(row.sourceKey)) continue;
    const feedKey = row.bucket.feedKey || stableFeedKey(row.feedUrl);
    const bucket: CollectFeedStatRow = {
      ...row.bucket,
      feedKey,
      category:
        row.bucket.category ??
        (row.category && CATEGORY_RE.test(row.category) ? row.category : null),
    };
    const entry = bySource.get(row.sourceKey) ?? {
      feeds: [],
      lastSuccessAt: null,
      lastFailureAt: null,
    };
    entry.feeds.push(bucket);
    if (row.fetchedOk) {
      entry.lastSuccessAt = row.at;
    } else {
      entry.lastFailureAt = row.at;
    }
    bySource.set(row.sourceKey, entry);

    stats.rssReceived += bucket.rssReceived;
    stats.dateOkWithin72h += bucket.dateOkWithin72h;
    stats.saved += bucket.saved;
    stats.feedFetchFailed += bucket.feedFetchFailed;
    stats.undated += bucket.undated;
    stats.olderThan72h += bucket.olderThan72h;
    stats.duplicateUrl += bucket.duplicateUrl;
    stats.feedOrSourceCap += bucket.feedOrSourceCap;
    stats.fieldCountryKeyword += bucket.fieldCountryKeyword;
    stats.otherSkipped += bucket.otherSkipped;
    stats.saveFailed += bucket.saveFailed;
  }

  stats.sources = [...bySource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sourceKey, entry]) => {
      const summed = sumFeedRows(entry.feeds);
      return {
        sourceKey,
        ...summed,
        lastSuccessAt: entry.lastSuccessAt,
        lastFailureAt: entry.lastFailureAt,
        feeds: entry.feeds,
      };
    });

  return stats;
}

/** Combine partial run totals (tests / aggregation helpers). */
export function addCollectRunExclusionStats(
  a: CollectRunExclusionStats,
  b: Partial<CollectRunExclusionStats>
): CollectRunExclusionStats {
  const out = emptyCollectRunExclusionStats(a.runLimit.configured);
  for (const key of Object.keys(
    COLLECT_RUN_SUMMARY_STAT_LABELS
  ) as CollectRunSummaryStatKey[]) {
    out[key] = (a[key] ?? 0) + (typeof b[key] === "number" ? b[key]! : 0);
  }
  out.byCategory = { ...a.byCategory };
  for (const [cat, n] of Object.entries(b.byCategory ?? {})) {
    if (!cat || typeof n !== "number" || n <= 0) continue;
    out.byCategory[cat] = (out.byCategory[cat] ?? 0) + n;
  }
  out.runLimit = { ...a.runLimit, ...(b.runLimit ?? {}) };
  out.sources = b.sources ?? a.sources;
  return out;
}
