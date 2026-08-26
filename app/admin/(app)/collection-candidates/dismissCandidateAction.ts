"use server";

import { revalidateAdminNavCountsCache } from "@/lib/admin/revalidateAdminNav";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { dismissCollectionCandidate } from "@/lib/collection-candidates/dismissCollectionCandidate";
import { collectionCandidatesListPath } from "@/lib/collection-candidates/listPathFromForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** 제외 — DB status update만. OpenAI / jsdom 미사용. */
export async function dismissCollectionCandidateAction(formData: FormData) {
  const candidateId = String(formData.get("candidateId") ?? "").trim();
  if (!candidateId) {
    redirect(collectionCandidatesListPath(formData, { dismissError: "missing" }));
  }

  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user || !isAllowedAdminEmail(user.email)) {
    redirect(collectionCandidatesListPath(formData, { dismissError: "auth" }));
  }

  const dismissedBy = user.email ?? null;
  const result = await dismissCollectionCandidate({
    candidateId,
    dismissedBy,
  });

  revalidateAdminNavCountsCache();
  revalidatePath("/admin/collection-candidates");

  if (!result.ok) {
    redirect(collectionCandidatesListPath(formData, { dismissError: "1" }));
  }

  redirect(collectionCandidatesListPath(formData, { dismissed: "1" }));
}
