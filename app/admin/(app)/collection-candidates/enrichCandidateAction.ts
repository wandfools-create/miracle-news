"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { collectionCandidatesListPath } from "@/lib/collection-candidates/listPathFromForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EnrichCandidateActionState =
  | { ok: true; articleId: string }
  | { ok: false; error: string; step?: string; categoryLabel?: string }
  | null;

function revalidateCandidatePages(articleId?: string) {
  revalidatePath("/admin/collection-candidates");
  revalidatePath("/admin/review");
  if (articleId) {
    revalidatePath(`/admin/review/${articleId}`);
  }
}

/**
 * 기사 만들기 — from-link / jsdom / OpenAI는 이 action 실행 시에만 dynamic import.
 * 목록 페이지 로드에서는 로드되지 않음.
 */
export async function enrichCollectionCandidateAction(
  _prev: EnrichCandidateActionState,
  formData: FormData
): Promise<EnrichCandidateActionState> {
  const candidateId = String(formData.get("candidateId") ?? "").trim();

  if (!candidateId) {
    return { ok: false, error: "후보 ID가 없습니다.", step: "validation" };
  }

  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user || !isAllowedAdminEmail(user.email)) {
    return { ok: false, error: "관리자만 기사를 만들 수 있습니다.", step: "auth" };
  }

  const { promoteCollectionCandidate } = await import(
    "@/lib/collection-candidates/promoteCollectionCandidate"
  );

  const result = await promoteCollectionCandidate({
    candidateId,
    selectedBy: user.email ?? null,
  });

  if (!result.ok) {
    revalidateCandidatePages();
    return {
      ok: false,
      error: result.error,
      step: result.step,
      categoryLabel: result.categoryLabel,
    };
  }

  revalidateCandidatePages(result.articleId);
  redirect(collectionCandidatesListPath(formData, { made: result.articleId }));
}
