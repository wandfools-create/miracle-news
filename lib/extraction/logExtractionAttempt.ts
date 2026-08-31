import "server-only";

import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import {
  normalizeExtractionFailureCode,
  type ExtractionFailureCode,
} from "./failureTaxonomy";

export type LogExtractionAttemptInput = {
  url: string;
  source?: string | null;
  failureCode: ExtractionFailureCode | string;
  httpStatus?: number | null;
  extractedLength?: number | null;
  extractionMethod?: string | null;
  collectionRunId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logExtractionAttempt(
  input: LogExtractionAttemptInput
): Promise<void> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return;

  const { client } = createServiceRoleSupabaseClient();
  const failureCode = normalizeExtractionFailureCode(input.failureCode);
  const url = input.url.trim().slice(0, 2000);
  if (!url) return;

  await client.from("extraction_attempts").insert({
    url,
    source: input.source ?? null,
    failure_code: failureCode,
    http_status: input.httpStatus ?? null,
    extracted_length: input.extractedLength ?? null,
    extraction_method: input.extractionMethod ?? null,
    collection_run_id: input.collectionRunId ?? null,
    metadata: input.metadata ?? {},
    last_attempt_at: new Date().toISOString(),
  });
}

export type ExtractionFailureRow = {
  id: string;
  url: string;
  source: string | null;
  failure_code: string;
  http_status: number | null;
  extracted_length: number | null;
  extraction_method: string | null;
  attempt_count: number;
  last_attempt_at: string;
};

export async function fetchRecentExtractionFailures(limit = 50): Promise<{
  rows: ExtractionFailureRow[];
  error: string | null;
}> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { rows: [], error: envCheck.error };
  }

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("extraction_attempts")
    .select(
      "id, url, source, failure_code, http_status, extracted_length, extraction_method, attempt_count, last_attempt_at"
    )
    .order("last_attempt_at", { ascending: false })
    .limit(limit);

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as ExtractionFailureRow[], error: null };
}
