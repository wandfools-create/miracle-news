/**
 * Per-collect-run exclusion / intake counters (counts + reason codes only).
 * Never stores article bodies or full RSS payloads.
 */

export const COLLECT_RUN_EXCLUSION_STATS_VERSION = 1 as const;

/** Reason codes stored in stats / logs — short machine keys only. */
export type CollectExclusionReasonCode =
  | "feed_fetch_failed"
  | "undated"
  | "older_than_72h"
  | "duplicate_url"
  | "feed_cap"
  | "field_disabled"
  | "exclude_keyword"
  | "save_failed"
  | "other_skipped";

export type CollectRunExclusionStats = {
  version: typeof COLLECT_RUN_EXCLUSION_STATS_VERSION;
  /** Items present in fetched RSS/API payloads (sum across feeds). */
  rssReceived: number;
  /** Candidates inserted this run. */
  saved: number;
  /** Feeds that failed to fetch/parse. */
  feedFetchFailed: number;
  undated: number;
  olderThan72h: number;
  duplicateUrl: number;
  /** Eligible after filters but beyond per-feedUrl insert cap. */
  feedCapReached: number;
  /** Field/country checkbox disabled (or unclassified reject). */
  fieldDisabled: number;
  /** Hard exclude keywords (field/country/editorial). */
  excludeKeyword: number;
  saveFailed: number;
  otherSkipped: number;
  /** Saved candidates by desk category key. */
  byCategory: Record<string, number>;
};

export type CollectRunExclusionStatKey = Exclude<
  keyof CollectRunExclusionStats,
  "version" | "byCategory"
>;

export const COLLECT_RUN_EXCLUSION_STAT_LABELS: Record<
  CollectRunExclusionStatKey,
  string
> = {
  rssReceived: "RSS에서 받은 수",
  saved: "수집 후보로 저장된 수",
  feedFetchFailed: "RSS 접속 실패",
  undated: "날짜 없음·날짜 파싱 실패",
  olderThan72h: "72시간 초과",
  duplicateUrl: "중복 URL",
  feedCapReached: "피드별 최대 4건 제한",
  fieldDisabled: "분야·국가 체크 해제",
  excludeKeyword: "제외 키워드",
  saveFailed: "저장 실패",
  otherSkipped: "기타 제외",
};

export function emptyCollectRunExclusionStats(): CollectRunExclusionStats {
  return {
    version: COLLECT_RUN_EXCLUSION_STATS_VERSION,
    rssReceived: 0,
    saved: 0,
    feedFetchFailed: 0,
    undated: 0,
    olderThan72h: 0,
    duplicateUrl: 0,
    feedCapReached: 0,
    fieldDisabled: 0,
    excludeKeyword: 0,
    saveFailed: 0,
    otherSkipped: 0,
    byCategory: {},
  };
}

export function addCollectRunExclusionStats(
  a: CollectRunExclusionStats,
  b: Partial<CollectRunExclusionStats>
): CollectRunExclusionStats {
  const out = emptyCollectRunExclusionStats();
  for (const key of Object.keys(COLLECT_RUN_EXCLUSION_STAT_LABELS) as CollectRunExclusionStatKey[]) {
    out[key] = (a[key] ?? 0) + (typeof b[key] === "number" ? b[key]! : 0);
  }
  out.byCategory = { ...a.byCategory };
  for (const [cat, n] of Object.entries(b.byCategory ?? {})) {
    if (!cat || typeof n !== "number" || n <= 0) continue;
    out.byCategory[cat] = (out.byCategory[cat] ?? 0) + n;
  }
  return out;
}

export function incrementCategoryCount(
  byCategory: Record<string, number>,
  category: string | null | undefined
): void {
  const key = (category ?? "uncategorized").trim() || "uncategorized";
  byCategory[key] = (byCategory[key] ?? 0) + 1;
}

/**
 * Parse DB jsonb. Returns null when missing/invalid — UI must show 「기록 없음」.
 * Never invent zeros for legacy runs.
 */
export function parseCollectRunExclusionStats(
  raw: unknown
): CollectRunExclusionStats | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.version !== COLLECT_RUN_EXCLUSION_STATS_VERSION) return null;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;

  const stats = emptyCollectRunExclusionStats();
  for (const key of Object.keys(COLLECT_RUN_EXCLUSION_STAT_LABELS) as CollectRunExclusionStatKey[]) {
    const parsed = num(row[key]);
    if (parsed == null) return null;
    stats[key] = parsed;
  }

  const byCategory: Record<string, number> = {};
  if (row.byCategory && typeof row.byCategory === "object" && !Array.isArray(row.byCategory)) {
    for (const [k, v] of Object.entries(row.byCategory as Record<string, unknown>)) {
      const n = num(v);
      if (n == null || !k.trim()) continue;
      byCategory[k.trim().slice(0, 40)] = n;
    }
  }
  stats.byCategory = byCategory;
  return stats;
}

export type ExclusionStatDisplay =
  | { kind: "value"; value: number }
  | { kind: "missing"; label: "기록 없음" };

export function displayExclusionStat(
  stats: CollectRunExclusionStats | null | undefined,
  key: CollectRunExclusionStatKey
): ExclusionStatDisplay {
  if (!stats) return { kind: "missing", label: "기록 없음" };
  return { kind: "value", value: stats[key] };
}

export function formatExclusionStatDisplay(d: ExclusionStatDisplay): string {
  return d.kind === "missing" ? d.label : String(d.value);
}

/** Map field-profile / editorial decision keys into admin buckets. */
export function classifyFieldExclusionDecisionKey(
  decisionKey: string
): "fieldDisabled" | "excludeKeyword" | "otherSkipped" {
  const key = decisionKey.trim().toLowerCase();
  if (
    key.startsWith("field-disabled:") ||
    key === "science-lifestyle-disabled" ||
    key === "unclassified-reject" ||
    key.startsWith("scope:")
  ) {
    return "fieldDisabled";
  }
  if (
    key.startsWith("field-exclude-kw:") ||
    key.startsWith("country-exclude:") ||
    key === "soft-public-health-noise"
  ) {
    return "excludeKeyword";
  }
  return "otherSkipped";
}
