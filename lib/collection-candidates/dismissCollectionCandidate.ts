import "server-only";

import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export const DISMISSABLE_CANDIDATE_STATUSES = [
  "pending",
  "shortlisted",
  "enrich_failed",
  "enriching",
  "selected",
] as const;

export async function dismissCollectionCandidate(input: {
  candidateId: string;
  dismissedBy?: string | null;
}): Promise<
  | { ok: true; id: string; previousStatus: string }
  | { ok: false; error: string }
> {
  const candidateId = input.candidateId.trim();
  if (!candidateId) {
    return { ok: false, error: "후보 ID가 없습니다." };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error };
  }

  const { client } = createServiceRoleSupabaseClient();

  const { data: existing, error: fetchError } = await client
    .from("collection_candidates")
    .select("id, status, article_id")
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchError) {
    console.error("[collection-candidates] dismiss fetch failed", {
      candidateId,
      error: fetchError.message,
    });
    return { ok: false, error: fetchError.message };
  }
  if (!existing) {
    return { ok: false, error: "후보를 찾을 수 없습니다." };
  }

  const previousStatus = String(
    (existing as { status?: string }).status ?? ""
  );
  const allowed = (DISMISSABLE_CANDIDATE_STATUSES as readonly string[]).includes(
    previousStatus
  );
  if (!allowed) {
    return {
      ok: false,
      error: `현재 상태(${previousStatus || "unknown"})에서는 제외할 수 없습니다.`,
    };
  }

  // Prefer .select() array over maybeSingle() — 0-row updates must not look like success
  // and must not surface PostgREST PGRST116 as a cryptic failure.
  const { data, error, count } = await client
    .from("collection_candidates")
    .update(
      {
        status: "dismissed",
        dismissed_at: new Date().toISOString(),
        dismissed_by: input.dismissedBy?.trim() || null,
      },
      { count: "exact" }
    )
    .eq("id", candidateId)
    .eq("status", previousStatus)
    .select("id");

  if (error) {
    console.error("[collection-candidates] dismiss update failed", {
      candidateId,
      previousStatus,
      error: error.message,
      count,
    });
    return { ok: false, error: error.message };
  }

  const updatedId = data?.[0] ? String((data[0] as { id: string }).id) : null;
  if (!updatedId) {
    console.warn("[collection-candidates] dismiss updated 0 rows", {
      candidateId,
      previousStatus,
      count,
      dataLength: data?.length ?? 0,
    });
    return {
      ok: false,
      error: "제외 반영에 실패했습니다. 새로고침 후 다시 시도해 주세요.",
    };
  }

  console.info("[collection-candidates] dismissed", {
    candidateId: updatedId,
    previousStatus,
    count: data?.length ?? 0,
  });
  return { ok: true, id: updatedId, previousStatus };
}
