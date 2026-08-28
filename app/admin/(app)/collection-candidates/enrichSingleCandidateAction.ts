"use server";

import { revalidateAdminNavCountsCache } from "@/lib/admin/revalidateAdminNav";
import { isValidArticleUuid } from "@/lib/admin/approvedPublishIds";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import {
  mapPromoteToEnrichItemResult,
  unexpectedEnrichItemResult,
  type EnrichSingleCandidateItemResult,
} from "@/lib/collection-candidates/candidateEnrichBulk";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function revalidateAfterSingleEnrich(articleId?: string) {
  revalidateAdminNavCountsCache();
  revalidatePath("/admin/collection-candidates");
  revalidatePath("/admin/collection-shortlist");
  revalidatePath("/admin/review");
  if (articleId) {
    revalidatePath(`/admin/review/${articleId}`);
  }
}

/**
 * Redirect-free: enrich exactly one collection candidate (OpenAI when needed).
 * Used by bulk client sequential processing — never loop multiple IDs here.
 */
export async function enrichSingleCandidateAction(
  candidateIdInput: string
): Promise<EnrichSingleCandidateItemResult> {
  const candidateId = candidateIdInput.trim();

  if (!candidateId || !isValidArticleUuid(candidateId)) {
    return {
      candidateId: candidateId || "invalid",
      candidateTitle: "",
      ok: false,
      outcome: "unexpected_error",
      step: "validation",
      safeMessage: "후보 ID 형식이 올바르지 않습니다.",
    };
  }

  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user || !isAllowedAdminEmail(user.email)) {
    return {
      candidateId,
      candidateTitle: "",
      ok: false,
      outcome: "unexpected_error",
      step: "auth",
      safeMessage: "관리자만 기사를 만들 수 있습니다.",
    };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return {
      candidateId,
      candidateTitle: "",
      ok: false,
      outcome: "unexpected_error",
      step: envCheck.step ?? "env",
      safeMessage: "서버 설정을 확인할 수 없습니다.",
    };
  }

  const { client } = createServiceRoleSupabaseClient();
  const { data: row, error: fetchError } = await client
    .from("collection_candidates")
    .select("id, rss_title")
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchError || !row) {
    return {
      candidateId,
      candidateTitle: "",
      ok: false,
      outcome: "unexpected_error",
      step: "fetch_candidate",
      safeMessage: "후보를 찾을 수 없습니다.",
    };
  }

  const candidateTitle = String(
    (row as { rss_title?: string }).rss_title ?? ""
  ).trim();

  try {
    const { promoteCollectionCandidate } = await import(
      "@/lib/collection-candidates/promoteCollectionCandidate"
    );

    const promote = await promoteCollectionCandidate({
      candidateId,
      selectedBy: user.email ?? null,
    });

    const mapped = mapPromoteToEnrichItemResult({
      candidateId,
      candidateTitle,
      promote,
    });

    if (mapped.ok && mapped.articleId) {
      revalidateAfterSingleEnrich(mapped.articleId);
    } else if (mapped.outcome === "enrich_failed") {
      revalidateAfterSingleEnrich();
    } else {
      revalidateAfterSingleEnrich();
    }

    return mapped;
  } catch {
    revalidateAfterSingleEnrich();
    return unexpectedEnrichItemResult({ candidateId, candidateTitle });
  }
}
