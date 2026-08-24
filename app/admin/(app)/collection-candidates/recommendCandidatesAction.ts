"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { collectionCandidatesListPath } from "@/lib/collection-candidates/listPathFromForm";
import { recommendUnevaluatedCollectionCandidates } from "@/lib/collection-candidates/recommendCollectionCandidates";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RecommendCandidatesActionState =
  | {
      ok: true;
      queued: number;
      updated: number;
      openaiCalls: number;
      model: string;
    }
  | { ok: false; error: string; step?: string }
  | null;

/**
 * Manual 「AI 추천 갱신」 only — never on page load.
 * Uses OPENAI_CANDIDATE_MODEL; skips already scored rows.
 */
export async function recommendCandidatesAction(
  _prev: RecommendCandidatesActionState,
  formData: FormData
): Promise<RecommendCandidatesActionState> {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user || !isAllowedAdminEmail(user.email)) {
    return { ok: false, error: "관리자만 AI 추천을 실행할 수 있습니다.", step: "auth" };
  }

  const result = await recommendUnevaluatedCollectionCandidates();

  revalidatePath("/admin/collection-candidates");

  if (!result.ok) {
    return { ok: false, error: result.error, step: result.step };
  }

  redirect(
    collectionCandidatesListPath(formData, {
      recommended: String(result.updated),
      recommendQueued: String(result.queued),
      view: "ai",
    })
  );
}
