"use server";

import { revalidateAdminNavCountsCache } from "@/lib/admin/revalidateAdminNav";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import {
  dismissCollectionCandidatesBulk,
  expireCollectionCandidatesBulk,
} from "@/lib/collection-candidates/bulkCandidateOps";
import { collectionCandidatesListPath } from "@/lib/collection-candidates/listPathFromForm";
import { shortlistCollectionCandidates } from "@/lib/collection-candidates/shortlistOps";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BulkCandidateActionState =
  | { ok: true; count: number; action: "dismiss" | "expire" | "enrich" }
  | { ok: false; error: string; step?: string }
  | null;

function readIds(formData: FormData): string[] {
  return formData
    .getAll("candidateIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

async function requireAdmin() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) {
    return null;
  }
  return user;
}

function revalidateCandidateQueues(extraPaths: string[] = []) {
  revalidateAdminNavCountsCache();
  revalidatePath("/admin/collection-candidates");
  for (const p of extraPaths) revalidatePath(p);
}

/** Bulk dismiss — no OpenAI. */
export async function bulkDismissCandidatesAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) {
    redirect(collectionCandidatesListPath(formData, { dismissError: "auth" }));
  }

  const result = await dismissCollectionCandidatesBulk({
    candidateIds: readIds(formData),
    dismissedBy: user.email ?? null,
  });

  revalidateCandidateQueues();

  if (!result.ok || result.count === 0) {
    redirect(collectionCandidatesListPath(formData, { dismissError: "1" }));
  }

  redirect(collectionCandidatesListPath(formData, { dismissed: String(result.count) }));
}

/** Bulk expire/archive — no OpenAI. */
export async function bulkExpireCandidatesAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) {
    redirect(collectionCandidatesListPath(formData, { dismissError: "auth" }));
  }

  const result = await expireCollectionCandidatesBulk({
    candidateIds: readIds(formData),
  });

  revalidateCandidateQueues();

  if (!result.ok || result.count === 0) {
    redirect(collectionCandidatesListPath(formData, { dismissError: "1" }));
  }

  redirect(collectionCandidatesListPath(formData, { expired: String(result.count) }));
}

/** Bulk move to editorial shortlist — no OpenAI. */
export async function bulkShortlistCandidatesAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) {
    redirect(collectionCandidatesListPath(formData, { dismissError: "auth" }));
  }

  const result = await shortlistCollectionCandidates({
    candidateIds: readIds(formData),
    shortlistedBy: user.email ?? null,
  });

  revalidateCandidateQueues(["/admin/collection-shortlist"]);

  if (!result.ok || result.count === 0) {
    redirect(collectionCandidatesListPath(formData, { dismissError: "1" }));
  }

  redirect(
    collectionCandidatesListPath(formData, { shortlisted: String(result.count) })
  );
}
