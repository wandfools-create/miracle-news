import "server-only";

import { RSS_SOURCE_SECTION_ENRICHED } from "@/lib/rss/feedSources";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export type RssCollectCostStats = {
  candidatesAdded: number;
  enrichAttempts: number;
  enrichSucceeded: number;
  articlesSaved: number;
  aiThumbnailsGenerated: number;
  dbWrites: number;
};

export function emptyRssCollectCostStats(): RssCollectCostStats {
  return {
    candidatesAdded: 0,
    enrichAttempts: 0,
    enrichSucceeded: 0,
    articlesSaved: 0,
    aiThumbnailsGenerated: 0,
    dbWrites: 0,
  };
}

export type CollectRssMode = "dry-run" | "save" | "test";

export type CollectRssOptions = {
  mode: CollectRssMode;
  /** Persist collection_candidates (not articles). */
  save: boolean;
  /** No DB writes (candidates, collection_logs). */
  testMode: boolean;
  persistLogs: boolean;
  maxCandidatesPerRun: number;
  maxEnrichPerRun: number;
  maxSavesPerDay: number;
};

function isTruthy(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function getRssMaxCandidatesPerRun(): number {
  const raw = process.env.RSS_MAX_CANDIDATES_PER_RUN?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 30;
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return Math.min(parsed, 200);
}

export function getRssMaxEnrichPerRun(): number {
  const raw = process.env.RSS_MAX_ENRICH_PER_RUN?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 3;
  if (!Number.isFinite(parsed) || parsed <= 0) return 3;
  return Math.min(parsed, 20);
}

export function isRssAutoEnrichEnabled(): boolean {
  return isTruthy(process.env.RSS_AUTO_ENRICH);
}

export function getRssMaxSavesPerDay(): number {
  const raw = process.env.RSS_MAX_SAVES_PER_DAY?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 10;
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(parsed, 50);
}

export function isRssCollectSaveEnabled(): boolean {
  return isTruthy(process.env.RSS_COLLECT_SAVE);
}

/**
 * Cron / manual collect mode.
 * Candidates are written only when RSS_COLLECT_SAVE=1 (query flags cannot enable save).
 * OpenAI / article creation is never part of this path.
 */
export function resolveCollectRssOptions(
  searchParams?: URLSearchParams | null
): CollectRssOptions {
  const testFromQuery = isTruthy(searchParams?.get("test") ?? undefined);
  const testFromEnv = isTruthy(process.env.RSS_COLLECT_TEST);
  const testMode = testFromQuery || testFromEnv;
  const save = isRssCollectSaveEnabled() && !testMode;

  let mode: CollectRssMode = "dry-run";
  if (testMode) mode = "test";
  else if (save) mode = "save";

  return {
    mode,
    save,
    testMode,
    persistLogs: !testMode,
    maxCandidatesPerRun: getRssMaxCandidatesPerRun(),
    maxEnrichPerRun: 0,
    maxSavesPerDay: getRssMaxSavesPerDay(),
  };
}

function startOfUtcDayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** RSS auto-saved articles since UTC midnight. */
export async function countRssSavesToday(): Promise<number> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return 0;

  try {
    const { client } = createServiceRoleSupabaseClient();
    const { count, error } = await client
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("source_section", RSS_SOURCE_SECTION_ENRICHED)
      .gte("created_at", startOfUtcDayIso());

    if (error) {
      console.warn("[collectRss] countRssSavesToday failed", error);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.warn("[collectRss] countRssSavesToday threw", err);
    return 0;
  }
}

export function formatRssCollectCostNote(
  costs: RssCollectCostStats,
  extra?: Record<string, string | number | boolean>
): string {
  const parts = [
    `candidates_added=${costs.candidatesAdded}`,
    `openai_calls=0`,
    `enrich_attempts=${costs.enrichAttempts}`,
    `enrich_ok=${costs.enrichSucceeded}`,
    `saved=${costs.articlesSaved}`,
    `ai_thumbnails=${costs.aiThumbnailsGenerated}`,
    `db_writes=${costs.dbWrites}`,
  ];
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      parts.push(`${k}=${v}`);
    }
  }
  return `costs: ${parts.join(" ")}`;
}
