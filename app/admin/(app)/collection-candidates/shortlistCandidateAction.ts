"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { collectionCandidatesListPath } from "@/lib/collection-candidates/listPathFromForm";
import { shortlistCollectionCandidates } from "@/lib/collection-candidates/shortlistOps";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Single candidate → editorial shortlist. No OpenAI. */
export async function shortlistCollectionCandidateAction(formData: FormData) {
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

  const result = await shortlistCollectionCandidates({
    candidateIds: [candidateId],
    shortlistedBy: user.email ?? null,
  });

  revalidatePath("/admin/collection-candidates");
  revalidatePath("/admin/collection-shortlist");

  if (!result.ok) {
    redirect(collectionCandidatesListPath(formData, { dismissError: "1" }));
  }

  redirect(collectionCandidatesListPath(formData, { shortlisted: "1" }));
}
