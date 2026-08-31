import type { CollectionCandidateStatus } from "./types";

export type CollectionRunSummary = {
  runKey: string;
  runId: string | null;
  startedAt: string;
  region: string | null;
  status: "success" | "partial" | "failed" | "unknown";
  newCandidates: number;
  pending: number;
  articleized: number;
  dismissed: number;
  failed: number;
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
};

const RUN_BUCKET_MS = 6 * 60 * 60 * 1000;

function bucketStartIso(createdAt: string): string {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return createdAt;
  const bucket = Math.floor(ms / RUN_BUCKET_MS) * RUN_BUCKET_MS;
  return new Date(bucket).toISOString();
}

function runKeyForCandidate(row: CandidateRunRow): string {
  if (row.collection_run_id?.trim()) {
    return `run:${row.collection_run_id.trim()}`;
  }
  return `bucket:${bucketStartIso(row.created_at)}`;
}

function startedAtForKey(key: string, rows: CandidateRunRow[]): string {
  if (key.startsWith("run:")) {
    const times = rows.map((r) => Date.parse(r.created_at)).filter(Number.isFinite);
    return new Date(Math.min(...times)).toISOString();
  }
  if (key.startsWith("bucket:")) {
    return key.slice("bucket:".length);
  }
  return rows[0]?.created_at ?? new Date().toISOString();
}

function regionForRows(rows: CandidateRunRow[]): string | null {
  const countries = new Set(
    rows.map((r) => (r.source_country || "").trim().toUpperCase()).filter(Boolean)
  );
  if (countries.size === 0) return null;
  if (countries.size === 1) return [...countries][0]!;
  return "mixed";
}

function isArticleized(status: CollectionCandidateStatus): boolean {
  return status === "enriched" || status === "selected" || status === "enriching";
}

function isFailed(status: CollectionCandidateStatus, enrichError?: string | null): boolean {
  return status === "enrich_failed" || Boolean(enrichError?.trim());
}

export function summarizeCollectionRuns(
  candidates: CandidateRunRow[]
): CollectionRunSummary[] {
  const groups = new Map<string, CandidateRunRow[]>();
  for (const row of candidates) {
    const key = runKeyForCandidate(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const summaries: CollectionRunSummary[] = [];
  for (const [runKey, rows] of groups) {
    const pending = rows.filter((r) => r.status === "pending").length;
    const articleized = rows.filter((r) => isArticleized(r.status)).length;
    const dismissed = rows.filter((r) => r.status === "dismissed").length;
    const failed = rows.filter((r) => isFailed(r.status, r.enrich_error)).length;
    const total = rows.length;
    const processed = total - pending;
    const runId = runKey.startsWith("run:") ? runKey.slice(4) : null;

    summaries.push({
      runKey,
      runId,
      startedAt: startedAtForKey(runKey, rows),
      region: regionForRows(rows),
      status:
        failed > 0 && pending === total
          ? "failed"
          : failed > 0
            ? "partial"
            : "success",
      newCandidates: total,
      pending,
      articleized,
      dismissed,
      failed,
      total,
      processed,
    });
  }

  return summaries.sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)
  );
}

export function filterCandidatesByRunKey<T extends CandidateRunRow>(
  candidates: T[],
  runKey: string | null | undefined
): T[] {
  const key = runKey?.trim();
  if (!key) return candidates;
  return candidates.filter((row) => runKeyForCandidate(row) === key);
}

export function parseRunFilterParam(
  value: string | null | undefined
): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("run:") || raw.startsWith("bucket:")) return raw;
  return `run:${raw}`;
}
