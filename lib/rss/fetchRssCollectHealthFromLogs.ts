import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { checkSupabaseServiceEnvWithDnsCached } from "@/lib/supabase/serviceRole";

export type RssSourceCollectHealth = {
  sourceKey: string;
  label: string;
  feedUrl: string;
  enabled: boolean;
  status: "ok" | "error" | "inactive" | "unknown";
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  collectedCount: number;
  failedCount: number;
  retryState: "idle" | "recent_failure";
};

type CollectionLogRow = {
  source: string | null;
  status: string | null;
  saved_count: number | null;
  failed_count: number | null;
  note: string | null;
  created_at: string;
};

export async function fetchRssCollectHealthFromLogs(
  feeds: Array<{ sourceKey: string; label: string; feedUrl: string; enabled: boolean }>
): Promise<RssSourceCollectHealth[]> {
  const envCheck = await checkSupabaseServiceEnvWithDnsCached();
  if (!envCheck.ok) {
    return feeds.map((feed) => ({
      sourceKey: feed.sourceKey,
      label: feed.label,
      feedUrl: feed.feedUrl,
      enabled: feed.enabled,
      status: feed.enabled ? "unknown" : "inactive",
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureReason: null,
      collectedCount: 0,
      failedCount: 0,
      retryState: "idle",
    }));
  }

  const { client } = createServiceRoleSupabaseClient();
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { data } = await client
    .from("collection_logs")
    .select("source, status, saved_count, failed_count, note, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  const logs = (data ?? []) as CollectionLogRow[];
  const bySource = new Map<string, CollectionLogRow[]>();
  for (const row of logs) {
    const key = (row.source || "").trim().toLowerCase();
    if (!key || key.includes("rss collect (run)")) continue;
    const list = bySource.get(key) ?? [];
    list.push(row);
    bySource.set(key, list);
  }

  return feeds.map((feed) => {
    if (!feed.enabled) {
      return {
        sourceKey: feed.sourceKey,
        label: feed.label,
        feedUrl: feed.feedUrl,
        enabled: false,
        status: "inactive" as const,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        collectedCount: 0,
        failedCount: 0,
        retryState: "idle" as const,
      };
    }

    const rows =
      bySource.get(feed.sourceKey.toLowerCase()) ??
      bySource.get(feed.label.toLowerCase()) ??
      [];

    let lastSuccessAt: string | null = null;
    let lastFailureAt: string | null = null;
    let lastFailureReason: string | null = null;
    let collectedCount = 0;
    let failedCount = 0;

    for (const row of rows) {
      collectedCount += row.saved_count ?? 0;
      failedCount += row.failed_count ?? 0;
      const ok = row.status === "success" || (row.saved_count ?? 0) > 0;
      if (ok && !lastSuccessAt) lastSuccessAt = row.created_at;
      if (
        (row.status === "failed" || (row.failed_count ?? 0) > 0) &&
        !lastFailureAt
      ) {
        lastFailureAt = row.created_at;
        lastFailureReason = row.note?.slice(0, 240) ?? null;
      }
    }

    const status: RssSourceCollectHealth["status"] =
      rows.length === 0
        ? "unknown"
        : lastFailureAt && (!lastSuccessAt || lastFailureAt > lastSuccessAt)
          ? "error"
          : "ok";

    return {
      sourceKey: feed.sourceKey,
      label: feed.label,
      feedUrl: feed.feedUrl,
      enabled: true,
      status,
      lastSuccessAt,
      lastFailureAt,
      lastFailureReason,
      collectedCount,
      failedCount,
      retryState:
        lastFailureAt && (!lastSuccessAt || lastFailureAt > lastSuccessAt)
          ? "recent_failure"
          : "idle",
    };
  });
}

export type RecentRunLogSummary = {
  at: string;
  status: string;
  savedCount: number;
  failedCount: number;
  note: string | null;
};

export async function fetchRecentCollectionRunLogs(): Promise<RecentRunLogSummary[]> {
  const envCheck = await checkSupabaseServiceEnvWithDnsCached();
  if (!envCheck.ok) return [];

  const { client } = createServiceRoleSupabaseClient();
  const { data } = await client
    .from("collection_logs")
    .select("created_at, status, saved_count, failed_count, note, source")
    .ilike("source", "%rss collect%run%")
    .order("created_at", { ascending: false })
    .limit(8);

  return (data ?? []).map((row) => ({
    at: row.created_at as string,
    status: (row.status as string) || "unknown",
    savedCount: (row.saved_count as number) ?? 0,
    failedCount: (row.failed_count as number) ?? 0,
    note: (row.note as string | null) ?? null,
  }));
}
