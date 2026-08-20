"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { candidateListSearchParams } from "@/lib/collection-candidates/candidateListQuery";
import { dismissCollectionCandidate } from "@/lib/collection-candidates/dismissCollectionCandidate";
import { localizeSelectedCollectionCandidates } from "@/lib/collection-candidates/localizeCollectionCandidates";
import { promoteCollectionCandidate } from "@/lib/collection-candidates/promoteCollectionCandidate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EnrichCandidateActionState =
  | { ok: true; articleId: string }
  | { ok: false; error: string; step?: string; categoryLabel?: string }
  | null;

export type LocalizeCandidatesActionState =
  | { ok: true; queued: number; updated: number; openaiCalls: number }
  | { ok: false; error: string; step?: string }
  | null;

function revalidateCandidatePages(articleId?: string) {
  revalidatePath("/admin/collection-candidates");
  revalidatePath("/admin/review");
  if (articleId) {
    revalidatePath(`/admin/review/${articleId}`);
  }
}

function listPathFromForm(formData: FormData, extra?: Record<string, string>) {
  const params = new URLSearchParams(
    candidateListSearchParams({
      status: String(formData.get("statusFilter") ?? "").trim() || "actionable",
      source: String(formData.get("sourceFilter") ?? "").trim() || "all",
      date: String(formData.get("dateFilter") ?? "").trim() || "all",
    })
  );
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      params.set(key, value);
    }
  }
  return `/admin/collection-candidates?${params.toString()}`;
}

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
    listPathFromForm(formData, {
      localized: String(result.updated),
      queued: String(result.queued),
    })
  );
}

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
  redirect(listPathFromForm(formData, { made: result.articleId }));
}

export async function dismissCollectionCandidateAction(formData: FormData) {
  const candidateId = String(formData.get("candidateId") ?? "").trim();
  if (!candidateId) {
    redirect(listPathFromForm(formData, { dismissError: "missing" }));
  }

  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user || !isAllowedAdminEmail(user.email)) {
    redirect(listPathFromForm(formData, { dismissError: "auth" }));
  }

  const dismissedBy = user.email ?? null;
  const result = await dismissCollectionCandidate({
    candidateId,
    dismissedBy,
  });

  revalidatePath("/admin/collection-candidates");

  if (!result.ok) {
    redirect(listPathFromForm(formData, { dismissError: "1" }));
  }

  redirect(listPathFromForm(formData, { dismissed: "1" }));
}
