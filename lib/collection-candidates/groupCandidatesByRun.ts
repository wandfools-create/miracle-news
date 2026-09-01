/**
 * Pure helpers: group collection candidates into real vs estimated runs.
 * Estimated buckets follow 6h UTC collect slots (00/06/12/18) and region.
 * Display times use America/New_York (DST-safe via Intl).
 */

import { CRON_TIMEZONE } from "@/lib/cron/americaNewYork";
import {
  KOREA_SOURCE_KEYS,
  US_INTL_SOURCE_KEYS,
  type CollectRegion,
} from "@/lib/rss/collectRegions";
import type { CollectionCandidateStatus } from "./types";
import type { CollectionRunStatus } from "./collectionRunsCore";

export type CollectionRunKind = "real" | "estimated";

export type CollectionRunSummary = {
  runKey: string;
  kind: CollectionRunKind;
  runId: string | null;
  region: CollectRegion | "mixed" | null;
  startedAt: string;
  finishedAt: string | null;
  status: CollectionRunStatus | "unknown";
  collectedCount: number;
  newCandidates: number;
  pending: number;
  articleized: number;
  dismissed: number;
  failed: number;
  discordNotified: number | null;
  total: number;
  processed: number;
};

export type CandidateRunRow = {
  id: string;
  source: string;
  source_country?: string | null;
  status: CollectionCandidateStatus;
  collection_run_id?: string | null;
  created_at: string;
  enrich_error?: string | null;
  discord_brief_sent_at?: string | null;
};

export type StoredCollectionRun = {
  id: string;
  region: string | null;
  started_at: string;
  finished_at: string | null;
  status: string | null;
  collected_count?: number | null;
  new_candidate_count?: number | null;
  duplicate_count?: number | null;
  failed_count?: number | null;
};

/** UTC collect slot hours matching desk cadence. */
export const COLLECTION_SLOT_HOURS_UTC = [0, 6, 12, 18] as const;

const RUN_BUCKET_MS = 6 * 60 * 60 * 1000;

const KR_SET = new Set<string>(KOREA_SOURCE_KEYS);
const US_SET = new Set<string>(US_INTL_SOURCE_KEYS);

export function estimateCollectionBucketStartIso(createdAt: string): string {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return createdAt;
  const bucket = Math.floor(ms / RUN_BUCKET_MS) * RUN_BUCKET_MS;
  return new Date(bucket).toISOString();
}

export function inferCandidateCollectRegion(
  row: Pick<CandidateRunRow, "source" | "source_country">
): CollectRegion | null {
  const key = row.source.trim();
  if (KR_SET.has(key)) return "korea";
  if (US_SET.has(key)) return "us-intl";
  const country = (row.source_country || "").trim().toUpperCase();
  if (country === "KR" || country === "KOREA") return "korea";
  if (country === "US" || country === "INTL" || country === "INTERNATIONAL") {
    return "us-intl";
  }
  return null;
}

export function runKeyForCandidate(row: CandidateRunRow): string {
  const runId = row.collection_run_id?.trim();
  if (runId) return `run:${runId}`;
  const bucket = estimateCollectionBucketStartIso(row.created_at);
  const region = inferCandidateCollectRegion(row) ?? "unknown";
  return `est:${region}:${bucket}`;
}

export function parseRunFilterParam(
  value: string | null | undefined
): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("run:") || raw.startsWith("est:")) return raw;
  // UUID-looking → real run
  if (/^[0-9a-f-]{36}$/i.test(raw)) return `run:${raw}`;
  return raw;
}

export function parseRegionFilterParam(
  value: string | null | undefined
): CollectRegion | "all" {
  const v = value?.trim().toLowerCase();
  if (v === "korea" || v === "kr" || v === "ko") return "korea";
  if (v === "us-intl" || v === "us" || v === "international") return "us-intl";
  return "all";
}

function isArticleized(status: CollectionCandidateStatus): boolean {
  return (
    status === "enriched" ||
    status === "selected" ||
    status === "enriching" ||
    status === "shortlisted"
  );
}

function isFailed(
  status: CollectionCandidateStatus,
  enrichError?: string | null
): boolean {
  return status === "enrich_failed" || Boolean(enrichError?.trim());
}

function summarizeRows(
  runKey: string,
  kind: CollectionRunKind,
  rows: CandidateRunRow[],
  meta?: Partial<CollectionRunSummary>
): CollectionRunSummary {
  const pending = rows.filter((r) => r.status === "pending").length;
  const articleized = rows.filter((r) => isArticleized(r.status)).length;
  const dismissed = rows.filter((r) => r.status === "dismissed").length;
  const failed = rows.filter((r) => isFailed(r.status, r.enrich_error)).length;
  const discordSent = rows.filter((r) =>
    Boolean(r.discord_brief_sent_at?.trim())
  ).length;
  const total = rows.length;
  const processed = total - pending;
  const regions = new Set(
    rows
      .map((r) => inferCandidateCollectRegion(r))
      .filter((r): r is CollectRegion => r != null)
  );
  let region: CollectionRunSummary["region"] = meta?.region ?? null;
  if (!region) {
    if (regions.size === 1) region = [...regions][0]!;
    else if (regions.size > 1) region = "mixed";
  }

  const times = rows
    .map((r) => Date.parse(r.created_at))
    .filter(Number.isFinite);
  const startedAt =
    meta?.startedAt ??
    (times.length
      ? new Date(Math.min(...times)).toISOString()
      : new Date().toISOString());

  const statusFromRows: CollectionRunSummary["status"] =
    failed > 0 && pending === total
      ? "failed"
      : failed > 0
        ? "partial"
        : "success";

  return {
    runKey,
    kind,
    runId: kind === "real" ? runKey.slice(4) : null,
    region,
    startedAt,
    finishedAt: meta?.finishedAt ?? null,
    status: meta?.status ?? statusFromRows,
    collectedCount: meta?.collectedCount ?? total,
    newCandidates: meta?.newCandidates ?? total,
    pending: meta?.pending ?? pending,
    articleized: meta?.articleized ?? articleized,
    dismissed: meta?.dismissed ?? dismissed,
    failed: meta?.failed ?? failed,
    discordNotified:
      meta?.discordNotified !== undefined
        ? meta.discordNotified
        : discordSent > 0
          ? discordSent
          : null,
    total: meta?.total ?? total,
    processed: meta?.processed ?? processed,
  };
}

/**
 * Build run summaries from candidate rows + optional stored collection_runs.
 * Real runs and estimated buckets never share a key (no duplicate cards).
 */
export function summarizeCollectionRuns(
  candidates: CandidateRunRow[],
  storedRuns: StoredCollectionRun[] = []
): CollectionRunSummary[] {
  const groups = new Map<string, CandidateRunRow[]>();
  for (const row of candidates) {
    const key = runKeyForCandidate(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const summaries = new Map<string, CollectionRunSummary>();

  for (const run of storedRuns) {
    const key = `run:${run.id}`;
    const rows = groups.get(key) ?? [];
    groups.delete(key);
    const region =
      run.region === "korea" || run.region === "us-intl"
        ? run.region
        : null;
    const status = (
      ["running", "success", "partial", "failed"] as const
    ).includes(run.status as CollectionRunStatus)
      ? (run.status as CollectionRunStatus)
      : "unknown";

    summaries.set(
      key,
      summarizeRows(key, "real", rows, {
        region,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        status,
        collectedCount: run.collected_count ?? rows.length,
        newCandidates: run.new_candidate_count ?? rows.length,
        failed: run.failed_count ?? undefined,
      })
    );
  }

  for (const [runKey, rows] of groups) {
    const kind: CollectionRunKind = runKey.startsWith("run:")
      ? "real"
      : "estimated";
    let region: CollectionRunSummary["region"] = null;
    let startedAt: string | undefined;
    if (runKey.startsWith("est:")) {
      const parts = runKey.split(":");
      // est:region:iso
      const regionPart = parts[1];
      if (regionPart === "korea" || regionPart === "us-intl") {
        region = regionPart;
      }
      startedAt = parts.slice(2).join(":") || undefined;
    }
    summaries.set(
      runKey,
      summarizeRows(runKey, kind, rows, { region, startedAt })
    );
  }

  return [...summaries.values()].sort((a, b) => {
    const tb = Date.parse(b.startedAt);
    const ta = Date.parse(a.startedAt);
    if (tb !== ta) return tb - ta;
    // Stable: real before estimated, then runKey
    if (a.kind !== b.kind) return a.kind === "real" ? -1 : 1;
    return a.runKey.localeCompare(b.runKey);
  });
}

export function filterCandidatesByRunKey<T extends CandidateRunRow>(
  candidates: T[],
  runKey: string | null | undefined
): T[] {
  const key = parseRunFilterParam(runKey);
  if (!key) return candidates;
  return candidates.filter((row) => runKeyForCandidate(row) === key);
}

export function filterRunSummariesByRegion(
  runs: CollectionRunSummary[],
  region: CollectRegion | "all"
): CollectionRunSummary[] {
  if (region === "all") return runs;
  return runs.filter((r) => r.region === region);
}

/** Format instant in America/New_York (never hardcodes UTC−4/−5). */
export function formatCollectionRunTimeEt(
  value: string | null | undefined
): string {
  if (!value?.trim()) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: CRON_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function collectionRunRegionLabel(
  region: CollectionRunSummary["region"]
): string {
  if (region === "korea") return "한국";
  if (region === "us-intl") return "미국·국제";
  if (region === "mixed") return "혼합";
  return "지역 미상";
}

export function collectionRunStatusLabel(
  status: CollectionRunSummary["status"]
): string {
  switch (status) {
    case "running":
      return "진행 중";
    case "success":
      return "성공";
    case "partial":
      return "부분 성공";
    case "failed":
      return "실패";
    default:
      return "상태 미상";
  }
}
