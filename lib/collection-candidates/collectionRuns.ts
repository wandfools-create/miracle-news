/**
 * Collection run create / finish helpers (server-only).
 * Fail-open when collection_runs table is missing.
 */
import "server-only";

import type { CollectRegion } from "@/lib/rss/collectRegions";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import {
  isCollectionRunsSchemaMissing,
  resolveCollectionRunStatus,
  sanitizeCollectionRunErrorSummary,
  type CollectionRunStatus,
  type CollectionRunTriggerType,
} from "@/lib/collection-candidates/collectionRunsCore";

export type {
  CollectionRunStatus,
  CollectionRunTriggerType,
} from "@/lib/collection-candidates/collectionRunsCore";

export {
  isCollectionRunsSchemaMissing,
  resolveCollectionRunStatus,
  resolveCollectionTriggerType,
  sanitizeCollectionRunErrorSummary,
} from "@/lib/collection-candidates/collectionRunsCore";

export type CollectionRunRow = {
  id: string;
  region: CollectRegion;
  trigger_type: CollectionRunTriggerType;
  started_at: string;
  finished_at: string | null;
  status: CollectionRunStatus;
  collected_count: number;
  new_candidate_count: number;
  duplicate_count: number;
  failed_count: number;
  error_summary: string | null;
  created_at: string;
};

export type FinishCollectionRunInput = {
  runId: string;
  collectedCount: number;
  newCandidateCount: number;
  duplicateCount: number;
  failedCount: number;
  hardFailed?: boolean;
  errorSummary?: string | null;
};

export async function createCollectionRun(input: {
  region: CollectRegion;
  triggerType?: CollectionRunTriggerType;
  startedAt?: string;
}): Promise<string | null> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return null;

  try {
    const { client } = createServiceRoleSupabaseClient();
    const startedAt = input.startedAt ?? new Date().toISOString();
    const { data, error } = await client
      .from("collection_runs")
      .insert({
        region: input.region,
        trigger_type: input.triggerType ?? "unknown",
        started_at: startedAt,
        status: "running",
        collected_count: 0,
        new_candidate_count: 0,
        duplicate_count: 0,
        failed_count: 0,
      })
      .select("id")
      .single();

    if (error) {
      if (isCollectionRunsSchemaMissing(error)) {
        console.warn(
          "[collectionRuns] create skipped — migration not applied"
        );
        return null;
      }
      console.warn("[collectionRuns] create failed", {
        code: error.code,
        message: error.message?.slice(0, 160),
      });
      return null;
    }

    return (data as { id?: string } | null)?.id ?? null;
  } catch (err) {
    console.warn("[collectionRuns] create threw", {
      message: err instanceof Error ? err.message.slice(0, 160) : String(err),
    });
    return null;
  }
}

export async function finishCollectionRun(
  input: FinishCollectionRunInput
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!input.runId.trim()) return { ok: false, skipped: true };

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, skipped: true };

  const status = resolveCollectionRunStatus({
    newCandidateCount: input.newCandidateCount,
    failedCount: input.failedCount,
    hardFailed: input.hardFailed,
  });

  try {
    const { client } = createServiceRoleSupabaseClient();
    const { error } = await client
      .from("collection_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        collected_count: Math.max(0, input.collectedCount),
        new_candidate_count: Math.max(0, input.newCandidateCount),
        duplicate_count: Math.max(0, input.duplicateCount),
        failed_count: Math.max(0, input.failedCount),
        error_summary: sanitizeCollectionRunErrorSummary(input.errorSummary),
      })
      .eq("id", input.runId)
      .eq("status", "running");

    if (error) {
      if (isCollectionRunsSchemaMissing(error)) {
        return { ok: false, skipped: true };
      }
      console.warn("[collectionRuns] finish failed", {
        code: error.code,
        message: error.message?.slice(0, 160),
      });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[collectionRuns] finish threw", {
      message: err instanceof Error ? err.message.slice(0, 160) : String(err),
    });
    return { ok: false };
  }
}
