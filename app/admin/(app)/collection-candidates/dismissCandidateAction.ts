"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { candidateListSearchParams } from "@/lib/collection-candidates/candidateListQuery";
import { dismissCollectionCandidate } from "@/lib/collection-candidates/dismissCollectionCandidate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

/** 제외 — DB status update만. OpenAI / jsdom 미사용. */
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
