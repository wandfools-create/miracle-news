"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { localizeSelectedCollectionCandidates } from "@/lib/collection-candidates/localizeCollectionCandidates";
import { collectionCandidatesListPath } from "@/lib/collection-candidates/listPathFromForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LocalizeCandidatesActionState =
  | { ok: true; queued: number; updated: number; openaiCalls: number }
  | { ok: false; error: string; step?: string }
  | null;

/** 선택 항목 한글화 — OpenAI만. jsdom / from-link 미사용. */
export async function localizePendingCandidatesAction(
  _prev: LocalizeCandidatesActionState,
  formData: FormData
): Promise<LocalizeCandidatesActionState> {
  const candidateIds = formData
    .getAll("candidateIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user || !isAllowedAdminEmail(user.email)) {
    return { ok: false, error: "관리자만 후보를 한글화할 수 있습니다.", step: "auth" };
  }

  const result = await localizeSelectedCollectionCandidates(candidateIds);

  if (!result.ok) {
    revalidatePath("/admin/collection-candidates");
    return { ok: false, error: result.error, step: result.step };
  }

  revalidatePath("/admin/collection-candidates");
  redirect(
    collectionCandidatesListPath(formData, {
      localized: String(result.updated),
      queued: String(result.queued),
    })
  );
}
