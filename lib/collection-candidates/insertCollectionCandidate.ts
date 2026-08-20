import "server-only";

import type { CollectionCandidateRow } from "@/lib/collection-candidates/types";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
  formatPostgrestError,
} from "@/lib/supabase/serviceRole";

export type InsertCollectionCandidateInput = {
  source: string;
  sourceCountry?: string;
  feedLabel?: string | null;
  originalUrl: string;
  rssTitle: string;
  rssSummary?: string | null;
  rssPublishedAt?: string | null;
  rssGuid?: string | null;
  customUniqueId?: string | null;
  collectionRunId?: string | null;
};

export type InsertCollectionCandidateResult =
  | { ok: true; candidateId: string }
  | { ok: false; error: string; step: string; duplicateCandidateId?: string };

export async function findCollectionCandidateByUrl(input: {
  source: string;
  originalUrl: string;
}): Promise<{ ok: true; candidateId: string | null } | { ok: false; error: string }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error };
  }

  try {
    const { client } = createServiceRoleSupabaseClient();
    const { data, error } = await client
      .from("collection_candidates")
      .select("id")
      .eq("source", input.source)
      .eq("original_url", input.originalUrl)
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, candidateId: (data as { id: string } | null)?.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function insertCollectionCandidate(
  input: InsertCollectionCandidateInput
): Promise<InsertCollectionCandidateResult> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step };
  }

  const originalUrl = input.originalUrl.trim();
  const rssTitle = input.rssTitle.trim();
  if (!originalUrl || !rssTitle) {
    return { ok: false, error: "URL and title are required", step: "validation" };
  }

  const existing = await findCollectionCandidateByUrl({
    source: input.source,
    originalUrl,
  });
  if (!existing.ok) {
    return { ok: false, error: existing.error, step: "duplicate_check" };
  }
  if (existing.candidateId) {
    return {
      ok: false,
      error: "duplicate candidate",
      step: "duplicate",
      duplicateCandidateId: existing.candidateId,
    };
  }

  const row = {
    source: input.source,
    source_country: input.sourceCountry?.trim() || "US",
    feed_label: input.feedLabel?.trim() || null,
    original_url: originalUrl,
    rss_title: rssTitle,
    rss_summary: input.rssSummary?.trim() || null,
    rss_published_at: input.rssPublishedAt?.trim() || null,
    rss_guid: input.rssGuid?.trim() || null,
    custom_unique_id: input.customUniqueId?.trim() || null,
    status: "pending" as const,
    collection_run_id: input.collectionRunId ?? null,
  };

  try {
    const { client } = createServiceRoleSupabaseClient();
    const { data, error } = await client
      .from("collection_candidates")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "duplicate candidate",
          step: "duplicate",
        };
      }
      const formatted = formatPostgrestError("insert_collection_candidate", error);
      return { ok: false, error: formatted.error, step: formatted.step };
    }

    const id = (data as CollectionCandidateRow | null)?.id;
    if (!id) {
      return { ok: false, error: "insert returned no id", step: "insert" };
    }

    return { ok: true, candidateId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, step: "insert" };
  }
}
